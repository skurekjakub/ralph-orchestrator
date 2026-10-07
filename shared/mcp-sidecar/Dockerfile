FROM node:24-bookworm-slim

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
RUN npm install -g supergateway@4.1.0

# Pre-install Playwright MCP server + Chromium browser (avoids npx runtime download).
# The server's own installer fetches the browser build its bundled Playwright expects;
# `npx playwright install` would fetch the build of whatever Playwright release is current.
RUN npm install -g @playwright/mcp@0.0.83 \
    && playwright-mcp install-browser --with-deps chromium

# Git + CA certificates for ADO push/PR tools running inside the sidecar.
# ca-certificates is stripped from node:bookworm-slim; without it git cannot
# verify SSL certificates and all HTTPS operations fail with "CAfile: none".
# Python 3 + pip for CodeGraphContext (code graph MCP server).
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Server + gateway directories
RUN mkdir -p /opt/mcp/servers /opt/mcp/config /opt/mcp/gateway

# Gateway dependencies, from the lockfile so the MCP SDK the tool-filter proxy runs is the one its tests ran
COPY package.json package-lock.json /opt/mcp/gateway/
RUN cd /opt/mcp/gateway && npm ci --omit=dev

# Transfer ownership of all app directories to the runtime user so the process
# can write to them. Bind-mounted volumes (/workspace) work because the process
# UID matches the host file owner — no chown needed for those.
RUN chown -R ${HOST_UID}:${HOST_GID} /opt/mcp /opt/npm-global /opt/playwright-browsers

# Gateway code is mounted at runtime via compose overlay
# (shared/mcp-sidecar/dist/ → /opt/mcp/gateway/dist:ro)

USER ${HOST_UID}:${HOST_GID}
WORKDIR /opt/mcp

HEALTHCHECK --interval=5s --timeout=3s --start-period=300s --retries=3 \
  CMD node -e "fetch('http://localhost:9000/health').then(r=>{if(!r.ok)process.exit(1)})"

CMD ["/opt/mcp/entrypoint.sh"]
