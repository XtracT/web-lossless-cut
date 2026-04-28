# Stage 1: Build Frontend
FROM node:18-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Final Image
FROM node:18-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend dependencies
COPY backend/package*.json ./
RUN npm install

# Copy backend source
COPY backend/ ./

# Copy built frontend from Stage 1 to backend's public folder
COPY --from=frontend-build /frontend/dist ./public

# Expose the single port
EXPOSE 3001

# Volumes for media
VOLUME ["/input", "/output"]

CMD ["node", "index.js"]
