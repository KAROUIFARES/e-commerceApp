using System.ComponentModel.DataAnnotations;
using MongoDB.Driver;
using ProductService.Data;
using ProductService.Messaging;
using ProductService.Models;

var builder = WebApplication.CreateBuilder(args);

// --- MongoDB ---
var mongoUrl = builder.Configuration.GetConnectionString("Mongo")
    ?? throw new InvalidOperationException("ConnectionStrings:Mongo manquant");
builder.Services.AddSingleton<IMongoClient>(_ => new MongoClient(mongoUrl));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>()
    .GetDatabase(builder.Configuration["Mongo:Database"] ?? "productdb"));
builder.Services.AddSingleton<ProductRepository>();

// --- RabbitMQ (événements de commande -> stock) ---
builder.Services.AddSingleton(builder.Configuration.GetSection("RabbitMq").Get<RabbitMqOptions>() ?? new RabbitMqOptions());
builder.Services.AddHostedService<OrderEventsConsumer>();

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.UseExceptionHandler();
app.UseCors();

if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.MapGet("/health", async (IMongoDatabase db, CancellationToken ct) =>
{
    try
    {
        await db.RunCommandAsync<MongoDB.Bson.BsonDocument>("{ ping: 1 }", cancellationToken: ct);
        return Results.Ok(new { status = "ok", mongo = "up" });
    }
    catch (Exception)
    {
        return Results.Json(new { status = "degraded", mongo = "down" }, statusCode: 503);
    }
});

var products = app.MapGroup("/api/products").WithTags("Products");

products.MapGet("/", async (ProductRepository repo, string? search, string? category, int? page, int? pageSize, CancellationToken ct) =>
{
    var p = Math.Max(page ?? 1, 1);
    var size = Math.Clamp(pageSize ?? 20, 1, 100);
    var result = await repo.ListAsync(search, category, p, size, ct);
    return Results.Ok(new PagedResult<ProductResponse>(
        result.Items.Select(ProductResponse.From).ToList(), result.Total, result.Page, result.PageSize));
});

products.MapGet("/{id}", async (string id, ProductRepository repo, CancellationToken ct) =>
{
    if (!ProductRepository.IsValidId(id)) return Results.NotFound();
    var product = await repo.GetAsync(id, ct);
    return product is null ? Results.NotFound() : Results.Ok(ProductResponse.From(product));
}).WithName("GetProduct");

products.MapPost("/", async (ProductRequest request, ProductRepository repo, CancellationToken ct) =>
{
    if (Validate(request) is { } errors) return Results.ValidationProblem(errors);
    var created = await repo.CreateAsync(request, ct);
    return Results.CreatedAtRoute("GetProduct", new { id = created.Id }, ProductResponse.From(created));
});

products.MapPut("/{id}", async (string id, ProductRequest request, ProductRepository repo, CancellationToken ct) =>
{
    if (!ProductRepository.IsValidId(id)) return Results.NotFound();
    if (Validate(request) is { } errors) return Results.ValidationProblem(errors);
    var updated = await repo.UpdateAsync(id, request, ct);
    return updated is null ? Results.NotFound() : Results.Ok(ProductResponse.From(updated));
});

products.MapDelete("/{id}", async (string id, ProductRepository repo, CancellationToken ct) =>
{
    if (!ProductRepository.IsValidId(id)) return Results.NotFound();
    return await repo.DeleteAsync(id, ct) ? Results.NoContent() : Results.NotFound();
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
