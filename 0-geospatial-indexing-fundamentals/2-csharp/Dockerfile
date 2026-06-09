# ───── Stage 1: build ─────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app
COPY h3-geo-service.csproj ./
RUN dotnet restore
COPY Program.cs ./
RUN dotnet publish -c Release -o /out

# ───── Stage 2: runtime ─────
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /out ./
EXPOSE 3000
ENTRYPOINT ["dotnet", "h3-geo-service.dll"]
