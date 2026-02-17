FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# ============================================================
# Version pinning
# ============================================================
ARG NODE_MAJOR=24

ENV DEBIAN_FRONTEND=noninteractive

# ============================================================
# 1. Core build deps
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential ca-certificates curl gnupg2 lsb-release \
        software-properties-common wget apt-transport-https unzip jq \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 2. Node.js (via NodeSource)
# ============================================================
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 3. GitHub CLI
# ============================================================
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
        https://cli.github.com/packages stable main" \
        | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 4. Azure CLI
# ============================================================
RUN curl -fsSL https://aka.ms/InstallAzureCLIDeb | bash \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 5. VS Code extension test dependencies (xvfb + Electron native libs)
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
        xvfb libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
        libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
        libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
        libcairo2 libxshmfence1 libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 6. Copy scripts & finalize
# ============================================================
USER root
COPY --chown=vscode:vscode setup.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/setup.sh

# User-writable npm global prefix so setup.sh can install CLIs without sudo
RUN mkdir -p /home/vscode/.npm-global && chown vscode:vscode /home/vscode/.npm-global
ENV NPM_CONFIG_PREFIX=/home/vscode/.npm-global
ENV PATH="/home/vscode/.npm-global/bin:$PATH"

# Disable sudo for vscode user (prevent privilege escalation inside container)
RUN rm -f /etc/sudoers.d/vscode 2>/dev/null; \
    sed -i '/vscode/d' /etc/sudoers

USER vscode
WORKDIR /workspace
ENV DEBIAN_FRONTEND=dialog
