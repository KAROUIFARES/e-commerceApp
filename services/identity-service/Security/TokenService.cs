using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using IdentityService.Models;
using Microsoft.IdentityModel.Tokens;
using StackExchange.Redis;

namespace IdentityService.Security;

public class JwtOptions
{
    public string Issuer { get; set; } = "ecomm-identity";
    public string Audience { get; set; } = "ecomm-api";
    public string Key { get; set; } = string.Empty;
    public int ExpiresMinutes { get; set; } = 60;
}

/// <summary>
/// Émet des JWT signés et enregistre chaque token (identifiant jti) dans Redis avec un TTL égal à sa durée de vie.
/// Un token absent de Redis est considéré comme révoqué ou expiré : le gateway vérifie cette clé.
/// Clé : auth:token:{jti} -> userId
/// </summary>
public class TokenService(JwtOptions options, IConnectionMultiplexer redis)
{
    public const string KeyPrefix = "auth:token:";

    public async Task<(string Token, int ExpiresIn)> IssueAsync(User user)
    {
        var jti = Guid.NewGuid().ToString("N");
        var lifetime = TimeSpan.FromMinutes(options.ExpiresMinutes);
        var now = DateTime.UtcNow;

        var jwt = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id!),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(JwtRegisteredClaimNames.Name, $"{user.FirstName} {user.LastName}"),
                new Claim(JwtRegisteredClaimNames.Jti, jti),
            ],
            notBefore: now,
            expires: now + lifetime,
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.Key)), SecurityAlgorithms.HmacSha256));

        await redis.GetDatabase().StringSetAsync(KeyPrefix + jti, user.Id!, lifetime);
        return (new JwtSecurityTokenHandler().WriteToken(jwt), (int)lifetime.TotalSeconds);
    }
}
