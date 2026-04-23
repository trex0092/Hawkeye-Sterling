# Hawkeye Sterling — C# (.NET 8+)

```csharp
using System.Net.Http.Headers;
using System.Net.Http.Json;

public sealed class HawkeyeClient(HttpClient http)
{
    private const string Base = "https://hawkeye-sterling.netlify.app";
    private static readonly string Key =
        Environment.GetEnvironmentVariable("HAWKEYE_API_KEY")
            ?? throw new InvalidOperationException("HAWKEYE_API_KEY unset");

    public async Task<JsonDocument> ScreenAsync(string name, string jurisdiction = "", CancellationToken ct = default)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"{Base}/api/quick-screen")
        {
            Content = JsonContent.Create(new
            {
                subject = new { name, jurisdiction },
                candidates = Array.Empty<object>(),
            }),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Key);
        using var res = await http.SendAsync(req, ct);
        res.EnsureSuccessStatusCode();
        return await JsonDocument.ParseAsync(
            await res.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
    }
}

// Usage
var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
var hawkeye = new HawkeyeClient(http);
using var doc = await hawkeye.ScreenAsync("Ivan Petrov", "RU");
var severity = doc.RootElement.GetProperty("severity").GetString();
var top = doc.RootElement.GetProperty("topScore").GetInt32();
Console.WriteLine($"Severity {severity} · top {top}");
```
