# --- Сборка ---
FROM node:18-alpine AS build

WORKDIR /app

# npm ci ставит ровно те версии, что в package-lock.json: сборка воспроизводима,
# и в образ не попадёт случайно вышедшая (или подменённая) новая версия пакета
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src/ ./src/
COPY public/ ./public/
COPY tailwind.config.js postcss.config.js tsconfig.json ./

# Без встроенного в index.html скрипта — его запрещает политика безопасности (CSP);
# без source map — исходники не раздаются наружу
ENV INLINE_RUNTIME_CHUNK=false \
    GENERATE_SOURCEMAP=false
RUN npm run build

# --- Раздача статики ---
FROM nginx:1.27-alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
