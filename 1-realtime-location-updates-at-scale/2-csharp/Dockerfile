# Build stage: publish the ASP.NET Core app.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /app
COPY LocationTracker.csproj ./
RUN dotnet restore
COPY . ./
RUN dotnet publish -c Release -o /out

# Runtime stage: minimal ASP.NET runtime.
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=builder /out ./
EXPOSE 3017
ENTRYPOINT ["dotnet", "LocationTracker.dll"]
