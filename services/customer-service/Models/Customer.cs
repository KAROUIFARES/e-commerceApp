using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace CustomerService.Models;

public class Customer
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }

    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;

    /// <summary>Toujours stocké en minuscules (index unique).</summary>
    public string Email { get; set; } = string.Empty;

    public string? Phone { get; set; }
    public Address? Address { get; set; }

    /// <summary>Commandes actives du client, alimentées par les événements de l'order-service.</summary>
    public List<string> OrderIds { get; set; } = [];

    [BsonRepresentation(BsonType.Decimal128)]
    public decimal TotalSpent { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Address
{
    public string? Street { get; set; }
    public string? City { get; set; }
    public string? PostalCode { get; set; }
    public string? Country { get; set; }
}
