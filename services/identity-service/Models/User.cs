using System.ComponentModel.DataAnnotations;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace IdentityService.Models;

public class User
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;

    /// <summary>Toujours en minuscules (index unique).</summary>
    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public record SignUpRequest(
    [property: Required, StringLength(100, MinimumLength = 1)] string FirstName,
    [property: Required, StringLength(100, MinimumLength = 1)] string LastName,
    [property: Required, EmailAddress, StringLength(254)] string Email,
    [property: Required, StringLength(128, MinimumLength = 8)] string Password);

public record SignInRequest(
    [property: Required, EmailAddress, StringLength(254)] string Email,
    [property: Required, StringLength(128)] string Password);

public record UserResponse(string Id, string FirstName, string LastName, string Email)
{
    public static UserResponse From(User u) => new(u.Id!, u.FirstName, u.LastName, u.Email);
}

public record AuthResponse(string AccessToken, string TokenType, int ExpiresIn, UserResponse User);
