import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import {
    cellArea,
    cellToBoundary,
    cellToLatLng,
    gridDisk,
    latLngToCell,
} from "h3-js"

@Injectable()
export class H3Service {
    private readonly resolution: number

    constructor(private readonly config: ConfigService) {
        this.resolution = Number(this.config.get("H3_RESOLUTION") ?? 9)
    }

    /** Băm tọa độ → ô lục giác H3 (offline, không Google API). */
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
            areaKm2: Number((cellArea(h3Index, "km2")).toFixed(4)),
            engine: "h3-js (Uber H3, CPU on server)",
            googleApiUsed: false,
        }
    }

    /** Lưới lân cận — dùng gom Cung/Cầu theo vùng. */
    neighbors(lat: number, lng: number, k = 1) {
        const origin = this.cell(lat, lng)
        const ring = gridDisk(origin.h3Index, k)
        return {
            origin: origin.h3Index,
            ringSize: ring.length,
            cells: ring.map((h3Index) => ({
                h3Index,
                center: (() => {
                    const [cLat, cLng] = cellToLatLng(h3Index)
                    return { lat: cLat, lng: cLng }
                })(),
            })),
        }
    }

    /** Demo surge theo ô (in-memory, không Redis). */
    demoSurgeByCell(lat: number, lng: number) {
        const { h3Index } = this.cell(lat, lng)
        const demand = 12 + (h3Index.charCodeAt(h3Index.length - 1) % 8)
        const supply = 3 + (h3Index.charCodeAt(0) % 4)
        const surgeMultiplier = Number(Math.max(1, demand / Math.max(supply, 1)).toFixed(2))
        return {
            h3Index,
            demand,
            supply,
            surgeMultiplier,
            note: "Surge thật ở L2 lưu demand/supply trên Redis theo h3Index.",
        }
    }
}
