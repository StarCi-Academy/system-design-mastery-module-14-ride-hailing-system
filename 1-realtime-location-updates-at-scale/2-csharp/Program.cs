using LocationTracker;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Allow PORT / REDIS_HOST / REDIS_PORT / HEARTBEAT_TTL_SEC env overrides for Docker.
var port = Environment.GetEnvironmentVariable("PORT") ?? "3017";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

// Register one shared multiplexer for the whole app (idiomatic StackExchange.Redis).
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
{
    var host = Environment.GetEnvironmentVariable("REDIS_HOST")
               ?? builder.Configuration["Redis:Host"] ?? "localhost";
    var redisPort = Environment.GetEnvironmentVariable("REDIS_PORT")
               ?? builder.Configuration["Redis:Port"] ?? "6379";
    return ConnectionMultiplexer.Connect($"{host}:{redisPort}");
});

builder.Services.AddSingleton<LocationService>();

var app = builder.Build();

app.MapGet("/api/health", (LocationService svc) =>
    Results.Ok(new { status = svc.Ping() ? "ok" : "down" }));

app.MapPost("/api/location/update", (LocationUpdate body, LocationService svc) =>
{
    if (string.IsNullOrWhiteSpace(body.DriverId)
        || body.Lat < -90 || body.Lat > 90 || body.Lng < -180 || body.Lng > 180)
    {
        return Results.BadRequest(new { error = "invalid driverId or coordinates" });
    }
    svc.UpdateLocation(body.DriverId, body.Lat, body.Lng);
    return Results.Ok(new { driverId = body.DriverId, updated = true });
});

app.MapGet("/api/location/nearby", (double lat, double lng, double radius, LocationService svc) =>
{
    if (radius <= 0 || lat < -90 || lat > 90 || lng < -180 || lng > 180)
    {
        return Results.BadRequest(new { error = "lat, lng and positive radius are required" });
    }
    var drivers = svc.FindNearby(lat, lng, radius);
    return Results.Ok(new
    {
        center = new { lat, lng },
        radiusM = radius,
        drivers,
    });
});

app.Run();

public record LocationUpdate(string DriverId, double Lat, double Lng);
