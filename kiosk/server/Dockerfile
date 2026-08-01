FROM node:20-slim

# better-sqlite3 needs build tools for its native addon.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
VOLUME ["/app/data"]

CMD ["node", "src/index.js"]
