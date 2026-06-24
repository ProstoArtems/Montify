# Этап 1: Сборка приложения
FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app

# Копируем дескриптор зависимостей и скачиваем их для кэширования
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Копируем исходный код и собираем jar-пакет
COPY src ./src
RUN mvn clean package -DskipTests -B

# Этап 2: Запуск приложения
FROM eclipse-temurin:21-jre
WORKDIR /app

# Копируем скомпилированный jar из этапа сборки
COPY --from=build /app/target/*.jar app.jar

# Открываем порт, на котором крутится Spring Boot
EXPOSE 8080

# Запуск приложения
ENTRYPOINT ["java", "-jar", "app.jar"]