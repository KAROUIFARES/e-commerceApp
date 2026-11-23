using Yarp.ReverseProxy.Transforms;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

var jwtSection = builder.Configuration.GetSection("Jwt");
var jwtKey = jwtSection["Key"];
if (string.IsNullOrEmpty(jwtKey) || jwtKey.Length < 32)
    throw new InvalidOperationException("Jwt:Key doit contenir au moins 32 caractères");

// --- Redis : les tokens émis par l'identity-service y sont enregistrés (auth:token:{jti}) ---
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
{
    var opts = ConfigurationOptions.Parse(builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379");
    opts.AbortOnConnectFail = false;
    return ConnectionMultiplexer.Connect(opts);
});

// --- Authentification : signature JWT + présence du jti dans Redis (révocation / expiration) ---
JwtSecurityTokenHandler.DefaultMapInboundClaims = false;
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwtSection["Issuer"],
            ValidAudience = jwtSection["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromSeconds(30),
        };
        o.Events = new JwtBearerEvents
        {
            OnTokenValidated = async ctx =>
            {
                var jti = ctx.Principal?.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
                try
                {
                    var redis = ctx.HttpContext.RequestServices.GetRequiredService<IConnectionMultiplexer>();
                    if (jti is null || !await redis.GetDatabase().KeyExistsAsync("auth:token:" + jti))
                        ctx.Fail("Token révoqué ou expiré");
                }
                catch (RedisException)
                {
                    // Fail closed : sans Redis on ne peut pas confirmer la session.
                    ctx.Fail("Service de sessions indisponible");
                }
            },
        };
    });
// "anonymous" et "default" sont des noms réservés YARP (utilisés dans appsettings).
builder.Services.AddAuthorizationBuilder()
    .SetDefaultPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser().Build());

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader()
    .AllowAnyMethod()));

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(ctx =>
    {
        // Transmet l'identité vérifiée aux services en aval (jamais celle fournie par le client).
        ctx.AddRequestTransform(t =>
        {
            t.ProxyRequest.Headers.Remove("X-User-Id");
            t.ProxyRequest.Headers.Remove("X-User-Email");
            var user = t.HttpContext.User;
            if (user.Identity?.IsAuthenticated == true)
            {
                t.ProxyRequest.Headers.TryAddWithoutValidation("X-User-Id", user.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
                t.ProxyRequest.Headers.TryAddWithoutValidation("X-User-Email", user.FindFirst(JwtRegisteredClaimNames.Email)?.Value);
            }
            return ValueTask.CompletedTask;
        });
    });

var app = builder.Build();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", async (IConnectionMultiplexer redis) =>
{
    try
    {
        await redis.GetDatabase().PingAsync();
        return Results.Ok(new { status = "ok", redis = "up" });
    }
    catch (Exception)
    {
        return Results.Json(new { status = "degraded", redis = "down" }, statusCode: 503);
    }
});

app.MapReverseProxy();

app.Run();
