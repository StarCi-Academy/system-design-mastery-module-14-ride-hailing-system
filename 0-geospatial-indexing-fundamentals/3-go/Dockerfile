# ───── Stage 1: build (cgo required by uber/h3-go) ─────
FROM golang:1.22-bookworm AS build
WORKDIR /app
ENV CGO_ENABLED=1
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN go build -o /h3-geo-service .

# ───── Stage 2: runtime ─────
FROM debian:bookworm-slim AS runtime
WORKDIR /app
COPY --from=build /h3-geo-service /h3-geo-service
EXPOSE 3000
ENTRYPOINT ["/h3-geo-service"]
