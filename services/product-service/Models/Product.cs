using System.ComponentModel.DataAnnotations;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace ProductService.Models;

public class Product
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Category { get; set; }
    public string? ImageUrl { get; set; }

    [BsonRepresentation(BsonType.Decimal128)]
    public decimal Price { get; set; }

    public int Stock { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public record ProductRequest(
    [property: Required, StringLength(200, MinimumLength = 1)] string Name,
    [property: StringLength(2000)] string? Description,
    [property: StringLength(100)] string? Category,
    [property: StringLength(2000), Url] string? ImageUrl,
    [property: Range(0, 1_000_000)] decimal Price,
    [property: Range(0, 1_000_000)] int Stock);

public record ProductResponse(
    string Id, string Name, string? Description, string? Category, string? ImageUrl,
    decimal Price, int Stock, DateTime CreatedAt, DateTime UpdatedAt)
{
    public static ProductResponse From(Product p) => new(
        p.Id!, p.Name, p.Description, p.Category, p.ImageUrl, p.Price, p.Stock, p.CreatedAt, p.UpdatedAt);
}

public record PagedResult<T>(IReadOnlyList<T> Items, long Total, int Page, int PageSize);

/// <summary>Réservation de stock faite pour une commande (clé = orderId) : rend le traitement des événements idempotent.</summary>
public class StockReservation
{
    [BsonId]
    public string OrderId { get; set; } = string.Empty;
    public List<ReservedItem> Items { get; set; } = [];
    public DateTime CreatedAt { get; set; }
}

public record ReservedItem(string ProductId, int Quantity);
