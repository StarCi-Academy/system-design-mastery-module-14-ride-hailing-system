import {
    latLngToCell,
    gridDisk,
    cellToLatLng,
    cellToBoundary,
    cellArea,
} from "h3-js"

// H3Service wraps the geospatial-indexing primitives used across the lesson:
// hash a coordinate into a deterministic hexagon cell, enumerate the k-ring of
// neighbour cells, and derive a per-cell surge signal — all pure CPU work in
// process, with no external datastore.
export class H3Service {
    constructor(private readonly resolution: number) {}

    // Hash a coordinate into an H3 hexagon cell (offline, no Google API).
    // latLngToCell is a pure function: same (lat, lng, resolution) always
    // yields the same cell id, so it can be used as a stable bucket key.
    cell(lat: number, lng: number, resolution?: number) {
        const res = resolution ?? this.resolution
        const h3Index = latLngToCell(lat, lng, res)
        const [centerLat, centerLng] = cellToLatLng(h3Index)
        const boundary = cellToBoundary(h3Index).map(([bLat, bLng]) => ({
            lat: bLat,
            lng: bLng,
        }))
        return {
            lat,
            lng,
            resolution: res,
            h3Index,
            center: { lat: centerLat, lng: centerLng },
            boundary,
            areaKm2: Number(cellArea(h3Index, "km2").toFixed(4)),
            engine: "h3-js (Uber H3, CPU on server)",
            googleApiUsed: false,
        }
    }

    // Neighbour grid — used to widen a driver-search radius and to aggregate
    // supply/demand per region. gridDisk returns the origin cell plus every
    // cell within k grid steps (a k-ring); for a hexagon k=1 yields 7 cells.
    neighbors(lat: number, lng: number, k = 1) {
        const origin = this.cell(lat, lng)
        const ring = gridDisk(origin.h3Index, k)
        return {
            origin: origin.h3Index,
            ringSize: ring.length,
            cells: ring.map((h3Index) => {
                const [cLat, cLng] = cellToLatLng(h3Index)
                return { h3Index, center: { lat: cLat, lng: cLng } }
            }),
        }
    }

    // Demo surge per cell (in-memory, no Redis). Because the cell id is
    // deterministic, the same coordinate always yields the same demand/supply
    // numbers, so the surge formula is reproducible without external state.
    demoSurgeByCell(lat: number, lng: number) {
        const { h3Index } = this.cell(lat, lng)
        const demand = 12 + (h3Index.charCodeAt(h3Index.length - 1) % 8)
        const supply = 3 + (h3Index.charCodeAt(0) % 4)
        const surgeMultiplier = Number(
            Math.max(1, demand / Math.max(supply, 1)).toFixed(2),
        )
        return {
            h3Index,
            demand,
            supply,
            surgeMultiplier,
            note: "Real surge in L2 stores demand/supply per h3Index in Redis.",
        }
    }
}
