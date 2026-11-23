using System.Text;
using System.Text.Json;
using CustomerService.Data;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace CustomerService.Messaging;

public class RabbitMqOptions
{
    public string HostName { get; set; } = "localhost";
    public int Port { get; set; } = 5672;
    public string UserName { get; set; } = "guest";
    public string Password { get; set; } = "guest";
    public string Exchange { get; set; } = "ecommerce.events";
    public string Queue { get; set; } = "customer-service.order-events";
}

public record OrderEvent(string? EventId, string? Type, DateTime OccurredAt, OrderEventData? Data);
public record OrderEventData(string? OrderId, string? CustomerId, decimal Total);
public record UserRegisteredEvent(string? EventId, string? Type, DateTime OccurredAt, UserRegisteredData? Data);
public record UserRegisteredData(string? UserId, string? FirstName, string? LastName, string? Email);

/// <summary>
/// Consomme les événements order.created / order.cancelled publiés par l'order-service
/// pour tenir à jour le nombre de commandes et le montant total dépensé par client,
/// et user.registered (identity-service) pour créer le profil client de l'utilisateur.
/// </summary>
public class OrderEventsConsumer(
    RabbitMqOptions options,
    CustomerRepository repository,
    ILogger<OrderEventsConsumer> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Reconnexion en boucle : le service démarre même si RabbitMQ n'est pas encore prêt.
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
            ClientProvidedName = "customer-service",
        };

        await using var connection = await factory.CreateConnectionAsync(ct);
        await using var channel = await connection.CreateChannelAsync(cancellationToken: ct);

        await channel.ExchangeDeclareAsync(options.Exchange, ExchangeType.Topic, durable: true, cancellationToken: ct);
        await channel.QueueDeclareAsync(options.Queue, durable: true, exclusive: false, autoDelete: false, cancellationToken: ct);
        await channel.QueueBindAsync(options.Queue, options.Exchange, "order.created", cancellationToken: ct);
        await channel.QueueBindAsync(options.Queue, options.Exchange, "order.cancelled", cancellationToken: ct);
        await channel.QueueBindAsync(options.Queue, options.Exchange, "user.registered", cancellationToken: ct);
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
                // Message illisible : le remettre en file ne servirait à rien.
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
        if (routingKey == "user.registered")
        {
            var reg = JsonSerializer.Deserialize<UserRegisteredEvent>(Encoding.UTF8.GetString(body.Span), JsonOptions)?.Data;
            if (reg?.UserId is null || !CustomerRepository.IsValidId(reg.UserId) || string.IsNullOrWhiteSpace(reg.Email))
                throw new JsonException("Données manquantes ou invalides dans l'événement user.registered");

            var created = await repository.EnsureFromUserAsync(
                reg.UserId, reg.FirstName ?? "", reg.LastName ?? "", reg.Email, ct);
            logger.LogInformation("user.registered traité : client {CustomerId} {Result}",
                reg.UserId, created ? "créé" : "déjà existant");
            return;
        }

        var evt = JsonSerializer.Deserialize<OrderEvent>(Encoding.UTF8.GetString(body.Span), JsonOptions);
        var data = evt?.Data;
        if (data?.OrderId is null || data.CustomerId is null || !CustomerRepository.IsValidId(data.CustomerId))
        {
            throw new JsonException($"Données manquantes ou invalides dans l'événement {routingKey}");
        }

        switch (routingKey)
        {
            case "order.created":
                await repository.RegisterOrderAsync(data.CustomerId, data.OrderId, data.Total, ct);
                break;
            case "order.cancelled":
                await repository.UnregisterOrderAsync(data.CustomerId, data.OrderId, data.Total, ct);
                break;
            default:
                logger.LogDebug("Événement {RoutingKey} ignoré", routingKey);
                return;
        }

        logger.LogInformation("{RoutingKey} traité : commande {OrderId} / client {CustomerId}",
            routingKey, data.OrderId, data.CustomerId);
    }
}
