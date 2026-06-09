using H3;
using H3.Algorithms;
using H3.Extensions;
using H3.Model;

// H3 geospatial indexing demo — ASP.NET Core minimal API + pocketken.H3.
// Pure CPU work: hash lat/lng to a cell id, enumerate the k-ring, derive
// in-memory surge signal. No external datastore required.

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT") ?? "3000";
var defaultRes = int.Parse(Environment.GetEnvironmentVariable("H3_RESOLUTION") ?? "9");

builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

var app = builder.Build();

// Hash a coordinate into an H3 hexagon cell.
// pocketken.H3 uses radians internally, so degrees must be converted first.
static H3Index CellFor(double lat, double lng, int res)
{
    var ll = new LatLng(lat * Math.PI / 180.0, lng * Math.PI / 180.0);
    return H3Index.FromLatLng(ll, res);
}

// GET /api/h3/cell?lat=&lng=&resolution= -> deterministic cell id + geometry.
// latLngToCell is a pure function: same (lat, lng, resolution) always yields
// the same cell id — a stable bucket key for grouping drivers/demand.
app.MapGet("/api/h3/cell", (double? lat, double? lng, int? resolution) =>
{
    // Default coordinate: Ho Chi Minh City centre.
    double reqLat = lat ?? 10.762622;
    double reqLng = lng ?? 106.660172;
    int res = resolution ?? defaultRes;

    // Validate: H3 only accepts lat in [-90,90] and lng in [-180,180].
    if (reqLat < -90 || reqLat > 90 || reqLng < -180 || reqLng > 180)
        return Results.BadRequest(new { error = "lat must be in [-90,90] and lng in [-180,180]" });

    var cell = CellFor(reqLat, reqLng, res);

    // Center: reverse-map cell id back to its centroid (convert radians -> degrees).
    var centerRad = cell.ToLatLng();
    var centerDeg = new { lat = centerRad.Latitude * 180.0 / Math.PI,
                          lng = centerRad.Longitude * 180.0 / Math.PI };

    // Boundary: 6 vertices via CellToVertexes + VertexToLatLng, each in degrees.
    var boundary = cell.CellToVertexes()
        .Select(v => {
            var ll = v.VertexToLatLng();
            return new { lat = ll.Latitude * 180.0 / Math.PI,
                         lng = ll.Longitude * 180.0 / Math.PI };
        })
        .ToList();

    // Area in km², rounded to 4 decimal places.
    double areaKm2 = Math.Round(cell.CellAreaInKmSquared(), 4);

    return Results.Json(new
    {
        lat = reqLat,
        lng = reqLng,
        resolution = res,
        h3Index = cell.ToString(),
        center = centerDeg,
        boundary,
        areaKm2,
        engine = "pocketken.H3 (Uber H3, CPU on server)",
        googleApiUsed = false,
    });
});

// GET /api/h3/neighbors?lat=&lng=&k= -> k-ring of cells around the coordinate.
// Accepts lat/lng directly (same as TS contract): hash to origin cell first,
// then call GridDiskDistances(origin, k). k=1 yields 7 cells for a hexagon.
app.MapGet("/api/h3/neighbors", (double? lat, double? lng, int? k) =>
{
    double reqLat = lat ?? 10.762622;
    double reqLng = lng ?? 106.660172;
    int rings = k ?? 1;

    // Validate coordinate range.
    if (reqLat < -90 || reqLat > 90 || reqLng < -180 || reqLng > 180)
        return Results.BadRequest(new { error = "lat must be in [-90,90] and lng in [-180,180]" });

    // Hash the pickup point into a cell, then enumerate the k-ring.
    var origin = CellFor(reqLat, reqLng, defaultRes);
    var disk = Rings.GridDiskDistances(origin, rings).ToList();

    // Each neighbour cell: return {h3Index, center} matching the TS contract.
    var cells = disk.Select(item =>
    {
        var centerRad = item.Index.ToLatLng();
        return new
        {
            h3Index = item.Index.ToString(),
            center = new
            {
                lat = centerRad.Latitude * 180.0 / Math.PI,
                lng = centerRad.Longitude * 180.0 / Math.PI,
            },
        };
    }).ToList();

    return Results.Json(new
    {
        origin = origin.ToString(),
        ringSize = disk.Count,
        cells,
    });
});

// GET /api/h3/surge-demo?lat=&lng= -> in-memory surge signal per cell.
// Because the cell id is deterministic, the same coordinate always yields the
// same demand/supply numbers — reproducible without external state.
app.MapGet("/api/h3/surge-demo", (double? lat, double? lng) =>
{
    double reqLat = lat ?? 10.762622;
    double reqLng = lng ?? 106.660172;

    var cell = CellFor(reqLat, reqLng, defaultRes);
    var h3Str = cell.ToString();

    // Deterministic demand/supply derived from the cell id string —
    // same h3Index always yields the same values (no external state needed).
    int demand = 12 + (h3Str[^1] % 8);
    int supply  = 3  + (h3Str[0]  % 4);
    // Surge multiplier: max(1, demand / max(supply, 1)), rounded to 2 dp.
    double surgeMultiplier = Math.Round(Math.Max(1.0, (double)demand / Math.Max(supply, 1)), 2);

    return Results.Json(new
    {
        h3Index = h3Str,
        demand,
        supply,
        surgeMultiplier,
        note = "Real surge in L2 stores demand/supply per h3Index in Redis.",
    });
});

app.Run();
