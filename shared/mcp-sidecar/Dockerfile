FROM node:22-bookworm-slim

# Dedicated non-root user for MCP server isolation
RUN groupadd -r mcp && useradd -r -g mcp -m -s /bin/false mcp

# Server + gateway directories (owned by mcp, unreadable by others)
RUN mkdir -p /opt/mcp/servers /opt/mcp/config /opt/mcp/gateway \
    && chown -R mcp:mcp /opt/mcp \
    && chmod 700 /opt/mcp

# npm prefix for global installs without root
RUN mkdir -p /home/mcp/.npm-global && chown mcp:mcp /home/mcp/.npm-global
ENV NPM_CONFIG_PREFIX=/home/mcp/.npm-global
ENV PATH="/home/mcp/.npm-global/bin:$PATH"

# Pre-install supergateway (stdio → Streamable HTTP bridge for npm servers)
RUN npm install -g supergateway@3

# Pre-install Playwright MCP server + Chromium browser (avoids npx runtime download)
RUN npm install -g @playwright/mcp@0.0.68 \
    && npx playwright install chromium \
    && npx playwright install-deps chromium

# Gateway dependencies
COPY --chown=mcp:mcp package.json /opt/mcp/gateway/
RUN cd /opt/mcp/gateway && npm install --omit=dev

# Gateway code is mounted at runtime via compose overlay
# (shared/mcp-sidecar/dist/ → /opt/mcp/gateway/dist:ro)

# Route HTTP/HTTPS through Squid egress proxy
ENV HTTP_PROXY="http://egress-proxy:3128"
ENV HTTPS_PROXY="http://egress-proxy:3128"
ENV NO_PROXY="localhost,127.0.0.1,app,egress-proxy"

USER mcp
WORKDIR /opt/mcp

HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:9000/health').then(r=>{if(!r.ok)process.exit(1)})"

CMD ["node", "/opt/mcp/gateway/dist/gateway.js", "/opt/mcp/config/gateway.json"]
