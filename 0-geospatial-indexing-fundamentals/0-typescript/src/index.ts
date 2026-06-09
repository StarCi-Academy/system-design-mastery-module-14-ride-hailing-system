import express, { Request, Response } from "express"
import { H3Service } from "./h3/h3.service"

const PORT = Number(process.env.PORT ?? 3000)
const H3_RESOLUTION = Number(process.env.H3_RESOLUTION ?? 9)

const h3 = new H3Service(H3_RESOLUTION)

const app = express()
app.use(express.json())

// Validate that a coordinate is inside H3's accepted range: lat in [-90, 90]
// and lng in [-180, 180]. Out-of-range values can only come from a bad client
// request, so they map to HTTP 400 (same contract as the Java/C#/Go services).
const invalidCoord = (lat: number, lng: number): boolean =>
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180

const COORD_ERROR = { error: "lat must be in [-90,90] and lng in [-180,180]" }

// GET /api/h3/cell?lat=&lng=&resolution= -> deterministic cell id + geometry.
app.get("/api/h3/cell", (req: Request, res: Response) => {
    const lat = Number(req.query.lat ?? 10.762622)
    const lng = Number(req.query.lng ?? 106.660172)
    if (invalidCoord(lat, lng)) {
        res.status(400).json(COORD_ERROR)
        return
    }
    const resolution =
        req.query.resolution !== undefined
            ? Number(req.query.resolution)
            : undefined
    res.status(200).json(h3.cell(lat, lng, resolution))
})

// GET /api/h3/neighbors?lat=&lng=&k= -> k-ring of cells around the coordinate.
app.get("/api/h3/neighbors", (req: Request, res: Response) => {
    const lat = Number(req.query.lat ?? 10.762622)
    const lng = Number(req.query.lng ?? 106.660172)
    if (invalidCoord(lat, lng)) {
        res.status(400).json(COORD_ERROR)
        return
    }
    const k = Number(req.query.k ?? 1)
    res.status(200).json(h3.neighbors(lat, lng, k))
})

// GET /api/h3/surge-demo?lat=&lng= -> per-cell demand/supply surge signal.
app.get("/api/h3/surge-demo", (req: Request, res: Response) => {
    const lat = Number(req.query.lat ?? 10.762622)
    const lng = Number(req.query.lng ?? 106.660172)
    if (invalidCoord(lat, lng)) {
        res.status(400).json(COORD_ERROR)
        return
    }
    res.status(200).json(h3.demoSurgeByCell(lat, lng))
})

// Bind 0.0.0.0 so the container is reachable from the host (coding.md S3).
app.listen(PORT, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`h3-geo-service listening on :${PORT}`)
})
