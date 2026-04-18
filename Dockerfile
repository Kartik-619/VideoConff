FROM node:20

# Install build tools for mediasoup
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json first (for caching)
COPY backend/package*.json ./

# Install dependencies (this compiles mediasoup worker)
RUN npm install

# Copy rest of backend
COPY backend/ .

# Build TypeScript
RUN npm run build

# Generate Prisma client (safe way)
RUN ./node_modules/.bin/prisma generate

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "dist/signaling/server.js"]
