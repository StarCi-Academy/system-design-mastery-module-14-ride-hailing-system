# Build stage: compile a static binary.
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY *.go ./
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /location-tracker .

# Runtime stage: minimal image with just the binary.
FROM alpine:3.20
WORKDIR /app
COPY --from=builder /location-tracker /location-tracker
EXPOSE 3017
CMD ["/location-tracker"]
