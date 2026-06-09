# Stage 1: build and publish the ASP.NET Core app
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY MatchingService.csproj ./
RUN dotnet restore
COPY Program.cs appsettings.json ./
RUN dotnet publish -c Release -o /app/publish

# Stage 2: runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./
EXPOSE 3000
ENTRYPOINT ["dotnet", "MatchingService.dll"]
