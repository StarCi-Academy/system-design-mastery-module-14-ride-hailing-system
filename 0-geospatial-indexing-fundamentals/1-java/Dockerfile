# ───── Stage 1: build ─────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml ./
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q clean package -DskipTests

# ───── Stage 2: runtime ─────
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
COPY --from=build /app/target/h3-geo-service.jar ./app.jar
EXPOSE 3000
ENTRYPOINT ["java", "-jar", "app.jar"]
