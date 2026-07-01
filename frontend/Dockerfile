FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
# Устанавливаем зависимости
RUN npm install

# Копируем исходный код (теперь это не затронет node_modules)
COPY . .

# Проверяем и запускаем
RUN npm run build

# Этап 2
FROM nginx:alpine
# Копируем ваш новый файл конфигурации
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]