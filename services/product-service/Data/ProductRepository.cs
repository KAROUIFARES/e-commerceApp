using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;
using ProductService.Models;

namespace ProductService.Data;

public class ProductRepository(IMongoDatabase database)
{
    private readonly IMongoCollection<Product> _products = database.GetCollection<Product>("products");
    private readonly IMongoCollection<StockReservation> _reservations = database.GetCollection<StockReservation>("stock_reservations");

    public static bool IsValidId(string id) => ObjectId.TryParse(id, out _);

    public async Task<PagedResult<Product>> ListAsync(string? search, string? category, int page, int pageSize, CancellationToken ct)
    {
        var f = Builders<Product>.Filter;
        var filter = f.Empty;
        if (!string.IsNullOrWhiteSpace(search))
        {
            var regex = new BsonRegularExpression(Regex.Escape(search.Trim()), "i");
            filter &= f.Or(f.Regex(p => p.Name, regex), f.Regex(p => p.Description, regex));
        }
        if (!string.IsNullOrWhiteSpace(category)) filter &= f.Eq(p => p.Category, category.Trim());

        var total = await _products.CountDocumentsAsync(filter, cancellationToken: ct);
        var items = await _products.Find(filter)
            .SortByDescending(p => p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync(ct);
        return new PagedResult<Product>(items, total, page, pageSize);
    }

    public async Task<Product?> GetAsync(string id, CancellationToken ct) =>
        await _products.Find(p => p.Id == id).FirstOrDefaultAsync(ct);

    public async Task<Product> CreateAsync(ProductRequest req, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var product = new Product
        {
            Name = req.Name.Trim(),
            Description = req.Description?.Trim(),
            Category = req.Category?.Trim(),
            ImageUrl = req.ImageUrl?.Trim(),
            Price = req.Price,
            Stock = req.Stock,
            CreatedAt = now,
            UpdatedAt = now,
        };
        await _products.InsertOneAsync(product, cancellationToken: ct);
        return product;
    }

    public async Task<Product?> UpdateAsync(string id, ProductRequest req, CancellationToken ct)
    {
        var update = Builders<Product>.Update
            .Set(p => p.Name, req.Name.Trim())
            .Set(p => p.Description, req.Description?.Trim())
            .Set(p => p.Category, req.Category?.Trim())
            .Set(p => p.ImageUrl, req.ImageUrl?.Trim())
            .Set(p => p.Price, req.Price)
            .Set(p => p.Stock, req.Stock)
            .Set(p => p.UpdatedAt, DateTime.UtcNow);
        return await _products.FindOneAndUpdateAsync(
            p => p.Id == id, update,
            new FindOneAndUpdateOptions<Product> { ReturnDocument = ReturnDocument.After }, ct);
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken ct) =>
        (await _products.DeleteOneAsync(p => p.Id == id, ct)).DeletedCount == 1;

    // --- Mises à jour du stock issues des événements de commande (idempotentes) ---

    /// <summary>Décrémente le stock pour une commande, une seule fois par commande. Le stock ne descend jamais sous 0.</summary>
    public async Task<bool> ReserveStockAsync(string orderId, IReadOnlyList<ReservedItem> items, CancellationToken ct)
    {
        try
        {
            await _reservations.InsertOneAsync(
                new StockReservation { OrderId = orderId, Items = [.. items], CreatedAt = DateTime.UtcNow },
                cancellationToken: ct);
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            return false; // événement déjà traité
        }

        foreach (var item in items.Where(i => IsValidId(i.ProductId)))
            await AdjustStockAsync(item.ProductId, -item.Quantity, ct);
        return true;
    }

    /// <summary>Restitue le stock d'une commande annulée, si une réservation existait.</summary>
    public async Task<bool> ReleaseStockAsync(string orderId, CancellationToken ct)
    {
        var reservation = await _reservations.FindOneAndDeleteAsync(r => r.OrderId == orderId, cancellationToken: ct);
        if (reservation is null) return false;

        foreach (var item in reservation.Items.Where(i => IsValidId(i.ProductId)))
            await AdjustStockAsync(item.ProductId, item.Quantity, ct);
        return true;
    }

    private async Task AdjustStockAsync(string productId, int delta, CancellationToken ct)
    {
        // Pipeline d'update : max(0, stock + delta) en une opération atomique.
        var pipeline = new EmptyPipelineDefinition<Product>()
            .AppendStage<Product, Product, Product>(new BsonDocument("$set", new BsonDocument
            {
                ["Stock"] = new BsonDocument("$max", new BsonArray { 0, new BsonDocument("$add", new BsonArray { "$Stock", delta }) }),
                ["UpdatedAt"] = "$$NOW",
            }));
        await _products.UpdateOneAsync(
            Builders<Product>.Filter.Eq(p => p.Id, productId),
            Builders<Product>.Update.Pipeline(pipeline),
            cancellationToken: ct);
    }
}
