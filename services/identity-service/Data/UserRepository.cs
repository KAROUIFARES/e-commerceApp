using IdentityService.Models;
using MongoDB.Driver;

namespace IdentityService.Data;

public class EmailAlreadyUsedException(string email) : Exception($"L'email '{email}' est déjà utilisé.");

public class UserRepository(IMongoDatabase database)
{
    private readonly IMongoCollection<User> _users = database.GetCollection<User>("users");

    public Task EnsureIndexesAsync(CancellationToken ct = default) =>
        _users.Indexes.CreateOneAsync(
            new CreateIndexModel<User>(
                Builders<User>.IndexKeys.Ascending(u => u.Email),
                new CreateIndexOptions { Unique = true, Name = "ux_email" }),
            cancellationToken: ct);

    public async Task<User?> FindByEmailAsync(string email, CancellationToken ct) =>
        await _users.Find(u => u.Email == email.Trim().ToLowerInvariant()).FirstOrDefaultAsync(ct);

    public async Task<User> CreateAsync(User user, CancellationToken ct)
    {
        try
        {
            await _users.InsertOneAsync(user, cancellationToken: ct);
        }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            throw new EmailAlreadyUsedException(user.Email);
        }
        return user;
    }
}
