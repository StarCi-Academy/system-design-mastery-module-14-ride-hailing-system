# Stage 1: build the Go binary
FROM golang:1.22-alpine AS build
WORKDIR /app
RUN apk add --no-cache gcc musl-dev
COPY go.mod ./
COPY main.go ./
RUN go mod tidy
RUN CGO_ENABLED=1 go build -o matching ./...

# Stage 2: minimal runtime image
FROM alpine:3.20 AS runtime
WORKDIR /app
COPY --from=build /app/matching ./matching
EXPOSE 3000
CMD ["./matching"]
