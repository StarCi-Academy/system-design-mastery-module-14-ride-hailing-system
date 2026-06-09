# Build stage: compile the Spring Boot fat jar.
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml ./
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q clean package -DskipTests

# Runtime stage: minimal JRE with the jar.
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/location-tracker.jar app.jar
EXPOSE 3017
CMD ["java", "-jar", "app.jar"]
