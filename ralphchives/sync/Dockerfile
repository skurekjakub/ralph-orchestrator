FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

# Bundle src/sync-runner.ts into dist/sync-runner.js; npm packages stay external in node_modules/
RUN npm run build

CMD ["node", "--enable-source-maps", "dist/sync-runner.js"]
