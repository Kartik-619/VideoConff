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

# FIX: give permission + run tsc
RUN chmod +x ./node_modules/.bin/tsc && ./node_modules/.bin/tsc

# Prisma generate
RUN chmod +x ./node_modules/.bin/prisma && ./node_modules/.bin/prisma generate

EXPOSE 8080

CMD ["node", "dist/signaling/server.js"]
