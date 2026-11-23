using System.Text;
using System.Text.Json;
using RabbitMQ.Client;

namespace IdentityService.Messaging;

public class RabbitMqOptions
{
    public string HostName { get; set; } = "localhost";
    public int Port { get; set; } = 5672;
    public string UserName { get; set; } = "guest";
    public string Password { get; set; } = "guest";
    public string Exchange { get; set; } = "ecommerce.events";
}

/// <summary>Publie des événements de domaine sur l'exchange topic partagé. Connexion paresseuse, rétablie si coupée.</summary>
public sealed class EventPublisher(RabbitMqOptions options, ILogger<EventPublisher> logger) : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly SemaphoreSlim _lock = new(1, 1);
    private IConnection? _connection;
    private IChannel? _channel;

    private async Task<IChannel> GetChannelAsync(CancellationToken ct)
    {
        if (_channel is { IsOpen: true }) return _channel;
        await _lock.WaitAsync(ct);
        try
        {
            if (_channel is { IsOpen: true }) return _channel;
            if (_connection is not null) await _connection.DisposeAsync();

            var factory = new ConnectionFactory
            {
                HostName = options.HostName,
                Port = options.Port,
                UserName = options.UserName,
                Password = options.Password,
                ClientProvidedName = "identity-service",
            };
            _connection = await factory.CreateConnectionAsync(ct);
            _channel = await _connection.CreateChannelAsync(
                new CreateChannelOptions(publisherConfirmationsEnabled: true, publisherConfirmationTrackingEnabled: true),
                ct);
            await _channel.ExchangeDeclareAsync(options.Exchange, ExchangeType.Topic, durable: true, cancellationToken: ct);
            return _channel;
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>Publie l'événement ; un échec est journalisé sans faire échouer la requête HTTP. Retourne false en cas d'échec.</summary>
    public async Task<bool> PublishSafeAsync(string routingKey, object data, CancellationToken ct = default)
    {
        try
        {
            var evt = new { eventId = Guid.NewGuid().ToString(), type = routingKey, occurredAt = DateTime.UtcNow, data };
            var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(evt, JsonOptions));
            var channel = await GetChannelAsync(ct);
            await channel.BasicPublishAsync(
                options.Exchange, routingKey, mandatory: false,
                new BasicProperties { ContentType = "application/json", DeliveryMode = DeliveryModes.Persistent, MessageId = evt.eventId },
                body, ct);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Échec de publication de {RoutingKey}", routingKey);
            return false;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_channel is not null) await _channel.DisposeAsync();
        if (_connection is not null) await _connection.DisposeAsync();
    }
}
