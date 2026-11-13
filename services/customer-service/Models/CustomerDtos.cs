using System.ComponentModel.DataAnnotations;

namespace CustomerService.Models;

public record CustomerRequest(
    [property: Required, StringLength(100, MinimumLength = 1)] string FirstName,
    [property: Required, StringLength(100, MinimumLength = 1)] string LastName,
    [property: Required, EmailAddress, StringLength(254)] string Email,
    [property: Phone, StringLength(30)] string? Phone,
    Address? Address);

public record CustomerResponse(
    string Id,
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    Address? Address,
    int OrderCount,
    decimal TotalSpent,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static CustomerResponse From(Customer c) => new(
        c.Id!, c.FirstName, c.LastName, c.Email, c.Phone, c.Address,
        c.OrderIds.Count, c.TotalSpent, c.CreatedAt, c.UpdatedAt);
}

public record PagedResult<T>(IReadOnlyList<T> Items, long Total, int Page, int PageSize);
