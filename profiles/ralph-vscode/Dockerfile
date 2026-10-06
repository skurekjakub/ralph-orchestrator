FROM node:24-bookworm-slim

# ============================================================
# Version pinning
# ============================================================
ENV DEBIAN_FRONTEND=noninteractive

# ============================================================
# 1. Non-root user (matches devcontainers convention)
#    node:24-bookworm-slim ships with uid/gid 1000 as "node" —
#    rename to "vscode" for consistency with agent scripts.
# ============================================================
RUN usermod -l vscode -d /home/vscode -m node \
    && groupmod -n vscode node

# ============================================================
# 2. System packages: git + xvfb + Electron/Chromium runtime libs
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates jq \
        xvfb xauth libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
        libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
        libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
        libcairo2 libxshmfence1 libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 3. Copy scripts & finalize
# ============================================================
COPY --chown=vscode:vscode setup.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/setup.sh

# User-writable npm global prefix so setup.sh can install CLIs without sudo
RUN mkdir -p /home/vscode/.npm-global && chown vscode:vscode /home/vscode/.npm-global
ENV NPM_CONFIG_PREFIX=/home/vscode/.npm-global
ENV PATH="/home/vscode/.npm-global/bin:$PATH"

USER vscode
WORKDIR /workspace
ENV DEBIAN_FRONTEND=dialog
