# ============================================================
# Pi Realm Server — Multi-stage Dockerfile
# ============================================================

# ---- Base ----
FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g tsx
ENV NODE_ENV=development

# ---- Dev (hot reload via tsx watch) ----
FROM base AS dev
# Install with ignore-scripts for speed
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
# Source will be mounted as a volume, not copied
EXPOSE 3001
CMD ["tsx", "watch", "src/server.ts"]

# ---- Build ----
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---- Prod ----
FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
RUN npm ci --ignore-scripts --omit=dev
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
