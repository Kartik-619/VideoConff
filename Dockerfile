FROM node:22

RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./

RUN npm install

COPY backend/ .

# FIX: use npx to avoid permission issues
RUN npx tsc

# Prisma generate
RUN ./node_modules/.bin/prisma generate

EXPOSE 8080

CMD ["node", "dist/signaling/server.js"]
