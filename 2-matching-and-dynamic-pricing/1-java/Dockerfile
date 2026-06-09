# Stage 1: build the Spring Boot jar
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# Stage 2: runtime image
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
COPY --from=build /app/target/matching-service-1.0.0.jar ./app.jar
EXPOSE 3000
ENTRYPOINT ["java", "-jar", "app.jar"]
