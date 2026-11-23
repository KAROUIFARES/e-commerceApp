using System.Text;
using System.Text.Json;
using ProductService.Data;
using ProductService.Models;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace ProductService.Messaging;

public class RabbitMqOptions
{
    public string HostName { get; set; } = "localhost";
    public int Port { get; set; } = 5672;
    public string UserName { get; set; } = "guest";
    public string Password { get; set; } = "guest";
    public string Exchange { get; set; } = "ecommerce.events";
    public string Queue { get; set; } = "product-service.order-events";
}

public record OrderEvent(string? EventId, string? Type, DateTime OccurredAt, OrderEventData? Data);
public record OrderEventData(string? OrderId, string? CustomerId, List<OrderEventItem>? Items);
public record OrderEventItem(string? ProductId, int Quantity);

/// <summary>Met à jour le stock : order.created décrémente, order.cancelled restitue.</summary>
public class OrderEventsConsumer(
    RabbitMqOptions options,
    ProductRepository repository,
    ILogger<OrderEventsConsumer> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ConsumeAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Connexion RabbitMQ perdue ou impossible, nouvelle tentative dans 5 s");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task ConsumeAsync(CancellationToken ct)
    {
        var factory = new ConnectionFactory
        {
            HostName = options.HostName,
            Port = options.Port,
            UserName = options.UserName,
            Password = options.Password,
            ClientProvidedName = "product-service",
        };

        await using var connection = await factory.CreateConnectionAsync(ct);
        await using var channel = await connection.CreateChannelAsync(cancellationToken: ct);

        await channel.ExchangeDeclareAsync(options.Exchange, ExchangeType.Topic, durable: true, cancellationToken: ct);
        await channel.QueueDeclareAsync(options.Queue, durable: true, exclusive: false, autoDelete: false, cancellationToken: ct);
        await channel.QueueBindAsync(options.Queue, options.Exchange, "order.created", cancellationToken: ct);
        await channel.QueueBindAsync(options.Queue, options.Exchange, "order.cancelled", cancellationToken: ct);
        await channel.BasicQosAsync(0, 10, false, ct);

        var closed = new TaskCompletionSource();
        connection.ConnectionShutdownAsync += (_, _) => { closed.TrySetResult(); return Task.CompletedTask; };

        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += async (_, ea) =>
        {
            try
            {
                await HandleAsync(ea.RoutingKey, ea.Body, ct);
                await channel.BasicAckAsync(ea.DeliveryTag, false, ct);
            }
            catch (JsonException ex)
            {
                logger.LogError(ex, "Message {RoutingKey} invalide, rejeté", ea.RoutingKey);
                await channel.BasicNackAsync(ea.DeliveryTag, false, requeue: false, ct);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Échec du traitement de {RoutingKey}, remis en file", ea.RoutingKey);
                await channel.BasicNackAsync(ea.DeliveryTag, false, requeue: true, ct);
            }
        };

        await channel.BasicConsumeAsync(options.Queue, autoAck: false, consumer, ct);
        logger.LogInformation("En écoute sur {Queue} (exchange {Exchange})", options.Queue, options.Exchange);

        await closed.Task.WaitAsync(ct);
        throw new InvalidOperationException("Connexion RabbitMQ fermée");
    }

    private async Task HandleAsync(string routingKey, ReadOnlyMemory<byte> body, CancellationToken ct)
    {
        var evt = JsonSerializer.Deserialize<OrderEvent>(Encoding.UTF8.GetString(body.Span), JsonOptions);
        var data = evt?.Data;
        if (string.IsNullOrEmpty(data?.OrderId))
            throw new JsonException($"orderId manquant dans l'événement {routingKey}");

        switch (routingKey)
        {
            case "order.created":
                var items = (data.Items ?? [])
                    .Where(i => !string.IsNullOrEmpty(i.ProductId) && i.Quantity > 0)
                    .Select(i => new ReservedItem(i.ProductId!, i.Quantity))
                    .ToList();
                var reserved = await repository.ReserveStockAsync(data.OrderId, items, ct);
                logger.LogInformation("order.created {OrderId} : stock {Result}", data.OrderId, reserved ? "décrémenté" : "déjà traité");
                break;
            case "order.cancelled":
                var released = await repository.ReleaseStockAsync(data.OrderId, ct);
                logger.LogInformation("order.cancelled {OrderId} : stock {Result}", data.OrderId, released ? "restitué" : "rien à restituer");
                break;
        }
    }
}
