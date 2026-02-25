FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

CMD ["node", "dist/sync-runner.js"]
