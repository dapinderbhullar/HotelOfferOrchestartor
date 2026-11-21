FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/gateway
ARG VITE_TEMPORAL_UI_URL=http://127.0.0.1:8080
ARG VITE_DISPLAY_CURRENCY=INR
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
