# —— build frontend ——
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Same-origin: browser calls /api via nginx proxy
ENV VITE_API_BASE_URL=
RUN npm run build

# —— serve with nginx ——
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
