using System.ComponentModel.DataAnnotations;
using CustomerService.Data;
using CustomerService.Messaging;
using CustomerService.Models;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

// --- MongoDB ---
var mongoUrl = builder.Configuration.GetConnectionString("Mongo")
    ?? throw new InvalidOperationException("ConnectionStrings:Mongo manquant");
var databaseName = builder.Configuration["Mongo:Database"] ?? "customerdb";
builder.Services.AddSingleton<IMongoClient>(_ => new MongoClient(mongoUrl));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>().GetDatabase(databaseName));
builder.Services.AddSingleton<CustomerRepository>();

// --- RabbitMQ (consommation des événements de commande) ---
var rabbitOptions = builder.Configuration.GetSection("RabbitMq").Get<RabbitMqOptions>() ?? new RabbitMqOptions();
builder.Services.AddSingleton(rabbitOptions);
builder.Services.AddHostedService<OrderEventsConsumer>();

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

await app.Services.GetRequiredService<CustomerRepository>().EnsureIndexesAsync();

app.UseExceptionHandler();
app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

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

var customers = app.MapGroup("/api/customers").WithTags("Customers");

customers.MapGet("/", async (CustomerRepository repo, string? search, int? page, int? pageSize, CancellationToken ct) =>
{
    var p = Math.Max(page ?? 1, 1);
    var size = Math.Clamp(pageSize ?? 20, 1, 100);
    var result = await repo.ListAsync(search, p, size, ct);
    return Results.Ok(new PagedResult<CustomerResponse>(
        result.Items.Select(CustomerResponse.From).ToList(), result.Total, result.Page, result.PageSize));
});

customers.MapGet("/{id}", async (string id, CustomerRepository repo, CancellationToken ct) =>
{
    if (!CustomerRepository.IsValidId(id)) return Results.NotFound();
    var customer = await repo.GetAsync(id, ct);
    return customer is null ? Results.NotFound() : Results.Ok(CustomerResponse.From(customer));
}).WithName("GetCustomer");

customers.MapPost("/", async (CustomerRequest request, CustomerRepository repo, CancellationToken ct) =>
{
    if (Validate(request) is { } errors) return Results.ValidationProblem(errors);
    try
    {
        var created = await repo.CreateAsync(request, ct);
        return Results.CreatedAtRoute("GetCustomer", new { id = created.Id }, CustomerResponse.From(created));
    }
    catch (EmailAlreadyUsedException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status409Conflict);
    }
});

customers.MapPut("/{id}", async (string id, CustomerRequest request, CustomerRepository repo, CancellationToken ct) =>
{
    if (!CustomerRepository.IsValidId(id)) return Results.NotFound();
    if (Validate(request) is { } errors) return Results.ValidationProblem(errors);
    try
    {
        var updated = await repo.UpdateAsync(id, request, ct);
        return updated is null ? Results.NotFound() : Results.Ok(CustomerResponse.From(updated));
    }
    catch (EmailAlreadyUsedException ex)
    {
        return Results.Problem(ex.Message, statusCode: StatusCodes.Status409Conflict);
    }
});

customers.MapDelete("/{id}", async (string id, CustomerRepository repo, CancellationToken ct) =>
{
    if (!CustomerRepository.IsValidId(id)) return Results.NotFound();
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
