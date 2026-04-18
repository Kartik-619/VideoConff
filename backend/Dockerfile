FROM node:20

# Install build tools needed for mediasoup worker compilation
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY backend/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY backend/ .

# Generate Prisma client and compile TypeScript
RUN npx prisma generate && npm run build

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "dist/signaling/server.js"]
