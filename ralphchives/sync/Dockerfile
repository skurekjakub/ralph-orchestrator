FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

CMD ["node", "dist/sync-runner.js"]
