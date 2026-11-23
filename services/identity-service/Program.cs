using System.ComponentModel.DataAnnotations;
using System.Threading.RateLimiting;
using IdentityService.Data;
using IdentityService.Messaging;
using IdentityService.Models;
using IdentityService.Security;
using MongoDB.Driver;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// --- MongoDB (utilisateurs) ---
var mongoUrl = builder.Configuration.GetConnectionString("Mongo")
    ?? throw new InvalidOperationException("ConnectionStrings:Mongo manquant");
builder.Services.AddSingleton<IMongoClient>(_ => new MongoClient(mongoUrl));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>()
    .GetDatabase(builder.Configuration["Mongo:Database"] ?? "identitydb"));
builder.Services.AddSingleton<UserRepository>();

// --- Redis (tokens) ---
var redisConn = builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
{
    var opts = ConfigurationOptions.Parse(redisConn);
    opts.AbortOnConnectFail = false; // le service démarre même si Redis n'est pas encore prêt
    return ConnectionMultiplexer.Connect(opts);
});

// --- JWT ---
var jwt = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (jwt.Key.Length < 32) throw new InvalidOperationException("Jwt:Key doit contenir au moins 32 caractères");
builder.Services.AddSingleton(jwt);
builder.Services.AddSingleton<TokenService>();

// --- RabbitMQ (événement user.registered) ---
builder.Services.AddSingleton(builder.Configuration.GetSection("RabbitMq").Get<RabbitMqOptions>() ?? new RabbitMqOptions());
builder.Services.AddSingleton<EventPublisher>();

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

// Anti brute-force : 10 requêtes d'authentification par minute et par IP.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

await app.Services.GetRequiredService<UserRepository>().EnsureIndexesAsync();

app.UseExceptionHandler();
app.UseRateLimiter();

if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.MapGet("/health", async (IMongoDatabase db, IConnectionMultiplexer redis, CancellationToken ct) =>
{
    var mongo = "up";
    var redisStatus = "up";
    try { await db.RunCommandAsync<MongoDB.Bson.BsonDocument>("{ ping: 1 }", cancellationToken: ct); }
    catch (Exception) { mongo = "down"; }
    try { await redis.GetDatabase().PingAsync(); }
    catch (Exception) { redisStatus = "down"; }
    var ok = mongo == "up" && redisStatus == "up";
    return Results.Json(new { status = ok ? "ok" : "degraded", mongo, redis = redisStatus }, statusCode: ok ? 200 : 503);
});

var auth = app.MapGroup("/api/auth").WithTags("Auth").RequireRateLimiting("auth");

auth.MapPost("/signup", async (
    SignUpRequest request, UserRepository users, TokenService tokens, EventPublisher events, CancellationToken ct) =>
{
    if (Validate(request) is { } errors) return Results.ValidationProblem(errors);

    var user = new User
    {
        FirstName = request.FirstName.Trim(),
        LastName = request.LastName.Trim(),
        Email = request.Email.Trim().ToLowerInvariant(),
        PasswordHash = PasswordHasher.Hash(request.Password),
        CreatedAt = DateTime.UtcNow,
    };

    try
    {
        await users.CreateAsync(user, ct);
    }
    catch (EmailAlreadyUsedException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status409Conflict);
    }

    // Asynchrone : le customer-service crée le profil client (même id que l'utilisateur).
    await events.PublishSafeAsync("user.registered",
        new { userId = user.Id, user.FirstName, user.LastName, user.Email }, ct);

    var (token, expiresIn) = await tokens.IssueAsync(user);
    return Results.Created($"/api/auth/users/{user.Id}",
        new AuthResponse(token, "Bearer", expiresIn, UserResponse.From(user)));
});

// Hash factice pour que la durée de réponse ne révèle pas si l'email existe.
var dummyHash = PasswordHasher.Hash("dummy-password-for-timing");

auth.MapPost("/signin", async (SignInRequest request, UserRepository users, TokenService tokens, CancellationToken ct) =>
{
    if (Validate(request) is { } errors) return Results.ValidationProblem(errors);

    var user = await users.FindByEmailAsync(request.Email, ct);
    var valid = PasswordHasher.Verify(request.Password, user?.PasswordHash ?? dummyHash);
    if (user is null || !valid)
        return Results.Problem("Email ou mot de passe incorrect.", statusCode: StatusCodes.Status401Unauthorized);

    var (token, expiresIn) = await tokens.IssueAsync(user);
    return Results.Ok(new AuthResponse(token, "Bearer", expiresIn, UserResponse.From(user)));
});

app.Run();

static Dictionary<string, string[]>? Validate(object model)
{
    var results = new List<ValidationResult>();
    if (Validator.TryValidateObject(model, new ValidationContext(model), results, validateAllProperties: true))
        return null;

    return results
        .SelectMany(r => r.MemberNames.DefaultIfEmpty(string.Empty), (r, member) => (member, r.ErrorMessage ?? "Invalide"))
        .GroupBy(x => x.member)
        .ToDictionary(g => g.Key, g => g.Select(x => x.Item2).ToArray());
}
