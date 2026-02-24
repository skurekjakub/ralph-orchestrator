FROM node:22-bookworm-slim

ARG HOST_UID=1000
ARG HOST_GID=1000

# All installs run as root so they land in predictable paths.
# Everything is chowned to HOST_UID:HOST_GID at the end before switching user.
ENV NPM_CONFIG_PREFIX=/opt/npm-global
ENV PATH="/opt/npm-global/bin:$PATH"
# Fixed path so playwright browsers survive the chown and are found at runtime.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers

RUN mkdir -p /opt/npm-global /opt/playwright-browsers

# Pre-install supergateway (stdio → Streamable HTTP bridge for npm servers)
RUN npm install -g supergateway@3

# Pre-install Playwright MCP server + Chromium browser (avoids npx runtime download)
RUN npm install -g @playwright/mcp@0.0.68 \
    && npx playwright install chromium \
    && npx playwright install-deps chromium

# Git + CA certificates for ADO push/PR tools running inside the sidecar.
# ca-certificates is stripped from node:bookworm-slim; without it git cannot
# verify SSL certificates and all HTTPS operations fail with "CAfile: none".
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Server + gateway directories
RUN mkdir -p /opt/mcp/servers /opt/mcp/config /opt/mcp/gateway

# Gateway dependencies
COPY package.json /opt/mcp/gateway/
RUN cd /opt/mcp/gateway && npm install --omit=dev

# Transfer ownership of all app directories to the runtime user so the process
# can write to them. Bind-mounted volumes (/workspace) work because the process
# UID matches the host file owner — no chown needed for those.
RUN chown -R ${HOST_UID}:${HOST_GID} /opt/mcp /opt/npm-global /opt/playwright-browsers

# Gateway code is mounted at runtime via compose overlay
# (shared/mcp-sidecar/dist/ → /opt/mcp/gateway/dist:ro)

USER ${HOST_UID}:${HOST_GID}
WORKDIR /opt/mcp

HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:9000/health').then(r=>{if(!r.ok)process.exit(1)})"

CMD ["node", "/opt/mcp/gateway/dist/gateway.js", "/opt/mcp/config/gateway.json"]
