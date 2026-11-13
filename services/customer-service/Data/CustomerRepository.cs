using System.Text.RegularExpressions;
using CustomerService.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace CustomerService.Data;

public class EmailAlreadyUsedException(string email) : Exception($"L'email '{email}' est déjà utilisé.");

public class CustomerRepository
{
    private readonly IMongoCollection<Customer> _customers;

    public CustomerRepository(IMongoDatabase database)
    {
        _customers = database.GetCollection<Customer>("customers");
    }

    public Task EnsureIndexesAsync(CancellationToken ct = default) =>
        _customers.Indexes.CreateOneAsync(
            new CreateIndexModel<Customer>(
                Builders<Customer>.IndexKeys.Ascending(c => c.Email),
                new CreateIndexOptions { Unique = true, Name = "ux_email" }),
            cancellationToken: ct);

    public static bool IsValidId(string id) => ObjectId.TryParse(id, out _);

    public async Task<PagedResult<Customer>> ListAsync(string? search, int page, int pageSize, CancellationToken ct)
    {
        var filter = Builders<Customer>.Filter.Empty;
        if (!string.IsNullOrWhiteSpace(search))
        {
            var regex = new BsonRegularExpression(Regex.Escape(search.Trim()), "i");
            filter = Builders<Customer>.Filter.Or(
                Builders<Customer>.Filter.Regex(c => c.FirstName, regex),
                Builders<Customer>.Filter.Regex(c => c.LastName, regex),
                Builders<Customer>.Filter.Regex(c => c.Email, regex));
        }

        var total = await _customers.CountDocumentsAsync(filter, cancellationToken: ct);
        var items = await _customers.Find(filter)
            .SortByDescending(c => c.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync(ct);

        return new PagedResult<Customer>(items, total, page, pageSize);
    }

    public async Task<Customer?> GetAsync(string id, CancellationToken ct) =>
        await _customers.Find(c => c.Id == id).FirstOrDefaultAsync(ct);

    public async Task<Customer> CreateAsync(CustomerRequest req, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var customer = new Customer
        {
            FirstName = req.FirstName.Trim(),
            LastName = req.LastName.Trim(),
            Email = req.Email.Trim().ToLowerInvariant(),
            Phone = req.Phone?.Trim(),
            Address = req.Address,
            CreatedAt = now,
            UpdatedAt = now,
        };

        try
        {
            await _customers.InsertOneAsync(customer, cancellationToken: ct);
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            throw new EmailAlreadyUsedException(customer.Email);
        }

        return customer;
    }

    public async Task<Customer?> UpdateAsync(string id, CustomerRequest req, CancellationToken ct)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        var update = Builders<Customer>.Update
            .Set(c => c.FirstName, req.FirstName.Trim())
            .Set(c => c.LastName, req.LastName.Trim())
            .Set(c => c.Email, email)
            .Set(c => c.Phone, req.Phone?.Trim())
            .Set(c => c.Address, req.Address)
            .Set(c => c.UpdatedAt, DateTime.UtcNow);

        try
        {
            return await _customers.FindOneAndUpdateAsync(
                c => c.Id == id, update,
                new FindOneAndUpdateOptions<Customer> { ReturnDocument = ReturnDocument.After },
                ct);
        }
        catch (MongoCommandException ex) when (ex.Code == 11000)
        {
            throw new EmailAlreadyUsedException(email);
        }
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken ct)
    {
        var result = await _customers.DeleteOneAsync(c => c.Id == id, ct);
        return result.DeletedCount == 1;
    }

    // --- Mises à jour issues des événements de commande (idempotentes) ---

    /// <summary>Ajoute la commande au client si elle n'y est pas déjà (rejouer l'événement ne compte pas deux fois).</summary>
    public Task RegisterOrderAsync(string customerId, string orderId, decimal total, CancellationToken ct) =>
        _customers.UpdateOneAsync(
            c => c.Id == customerId && !c.OrderIds.Contains(orderId),
            Builders<Customer>.Update
                .Push(c => c.OrderIds, orderId)
                .Inc(c => c.TotalSpent, total)
                .Set(c => c.UpdatedAt, DateTime.UtcNow),
            cancellationToken: ct);

    /// <summary>Retire la commande annulée si elle était comptée.</summary>
    public Task UnregisterOrderAsync(string customerId, string orderId, decimal total, CancellationToken ct) =>
        _customers.UpdateOneAsync(
            c => c.Id == customerId && c.OrderIds.Contains(orderId),
            Builders<Customer>.Update
                .Pull(c => c.OrderIds, orderId)
                .Inc(c => c.TotalSpent, -total)
                .Set(c => c.UpdatedAt, DateTime.UtcNow),
            cancellationToken: ct);
}
