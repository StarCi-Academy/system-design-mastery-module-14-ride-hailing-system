using System.Text.Json.Serialization;
using H3;
using H3.Extensions;
using NetTopologySuite.Geometries;
using StackExchange.Redis;

const int H3Resolution = 9;
const string GeoKey = "drivers:geo";
const int SupplyBaseline = 3;
const double SurgeCap = 3.0;
const int LockTtlSeconds = 30;
int[] rings = { 500, 1000, 2000, 5000 };

string redisHost = Environment.GetEnvironmentVariable("REDIS_HOST") ?? "localhost";
string redisPort = Environment.GetEnvironmentVariable("REDIS_PORT") ?? "6379";
string port = Environment.GetEnvironmentVariable("PORT") ?? "3000";

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
builder.Services.AddSingleton<IConnectionMultiplexer>(
    _ => ConnectionMultiplexer.Connect($"{redisHost}:{redisPort}"));

var app = builder.Build();
var mux = app.Services.GetRequiredService<IConnectionMultiplexer>();
IDatabase db = mux.GetDatabase();

// Seed a few available drivers into the geo set on boot.
(string id, double lat, double lng)[] seed =
{
    ("d1", 10.7770, 106.7010),
    ("d2", 10.7775, 106.7020),
    ("d3", 10.7740, 106.6980),
};
foreach (var d in seed)
{
    await db.GeoAddAsync(GeoKey, d.lng, d.lat, d.id);
}

// Map a coordinate to a fixed H3 cell so nearby riders share one demand key.
static string CellOf(double lat, double lng) =>
    new Coordinate(lng, lat).ToH3Index(H3Resolution).ToString();

app.MapGet("/health", () => Results.Json(new { status = "ok" }));

app.MapGet("/api/match/quote", async (double lat, double lng) =>
{
    string cell = CellOf(lat, lng);
    // INCR is atomic: concurrent quotes in the same cell never lose a count.
    long demand = await db.StringIncrementAsync($"demand:{cell}");
    long supply = SupplyBaseline;
    // Surge steps up as demand outpaces supply; clamp to a sane ceiling.
    double raw = 1.0 + (double)demand / Math.Max(supply, 1);
    double multiplier = Math.Min(Math.Round(raw, 2, MidpointRounding.AwayFromZero), SurgeCap);
    return Results.Json(new QuoteResult(cell, demand, supply, multiplier));
});

app.MapPost("/api/match/request", async (MatchRequest body) =>
{
    foreach (int radius in rings)
    {
        // Expanding ring: try the tightest radius first, widen only if empty.
        GeoRadiusResult[] candidates = await db.GeoSearchAsync(
            GeoKey, body.Lng, body.Lat,
            new GeoSearchCircle(radius, GeoUnit.Meters),
            order: Order.Ascending, count: 10, options: GeoRadiusOptions.WithDistance);

        foreach (GeoRadiusResult c in candidates)
        {
            string driverId = c.Member!;
            // Atomic claim: SET NX acts as a lock so no two riders grab the same driver.
            bool claimed = await db.StringSetAsync(
                $"lock:driver:{driverId}", body.RiderId,
                TimeSpan.FromSeconds(LockTtlSeconds), When.NotExists);
            if (!claimed) continue;

            await db.SortedSetRemoveAsync(GeoKey, driverId);
            int distance = (int)Math.Round(c.Distance ?? 0);
            return Results.Json(new MatchResult(body.RiderId, driverId, distance, radius, true));
        }
    }
    return Results.Json(new NoMatchResult(body.RiderId, false));
});

app.Run();

record QuoteResult(
    [property: JsonPropertyName("cell")] string Cell,
    [property: JsonPropertyName("demand")] long Demand,
    [property: JsonPropertyName("supply")] long Supply,
    [property: JsonPropertyName("multiplier")] double Multiplier);

record MatchRequest(
    [property: JsonPropertyName("riderId")] string RiderId,
    [property: JsonPropertyName("lat")] double Lat,
    [property: JsonPropertyName("lng")] double Lng);

record MatchResult(
    [property: JsonPropertyName("riderId")] string RiderId,
    [property: JsonPropertyName("driverId")] string DriverId,
    [property: JsonPropertyName("distanceMeters")] int DistanceMeters,
    [property: JsonPropertyName("ringMeters")] int RingMeters,
    [property: JsonPropertyName("matched")] bool Matched);

record NoMatchResult(
    [property: JsonPropertyName("riderId")] string RiderId,
    [property: JsonPropertyName("matched")] bool Matched);
