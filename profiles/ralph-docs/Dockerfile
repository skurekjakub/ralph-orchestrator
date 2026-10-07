FROM ubuntu:22.04

ARG NODE_MAJOR=24
ARG RUBY_VERSION=3.3.8
ARG BUNDLER_VERSION=2.6.9
ARG DOTNET_VERSION=10.0
ARG PANDOC_VERSION=3.8.3
ARG HOST_UID=1000
ARG HOST_GID=1000

ENV DEBIAN_FRONTEND=noninteractive

# ============================================================
# 0. Create non-root user
# ============================================================
RUN groupadd --gid ${HOST_GID} vscode \
    && useradd --uid ${HOST_UID} --gid ${HOST_GID} --create-home --shell /bin/bash vscode

# ============================================================
# 1. Locale — Ruby defaults to US-ASCII without this, causing
#    "invalid byte sequence" errors on UTF-8 content files
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends locales \
    && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8

# ============================================================
# 2. Runtime deps + build-time tools
#    build-essential/lib*-dev stay for native gem compilation
#    and Ruby source build (step 6)
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
        git bash build-essential ca-certificates \
        curl jq gnupg2 wget unzip \
        libssl-dev libyaml-dev libreadline-dev libffi-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 3. Node.js (via NodeSource)
# ============================================================
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 3.5. SQL Server client tools (sqlcmd)
# ============================================================
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
        | gpg --dearmor -o /etc/apt/keyrings/microsoft-prod.gpg \
    && chmod go+r /etc/apt/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/ubuntu/22.04/prod jammy main" \
        > /etc/apt/sources.list.d/microsoft-prod.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends \
        msodbcsql18 mssql-tools18 unixodbc \
    && ln -sf /opt/mssql-tools18/bin/sqlcmd /usr/local/bin/sqlcmd \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 4. .NET SDK (via official install script)
# ============================================================
RUN wget -qO /tmp/dotnet-install.sh https://dot.net/v1/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel ${DOTNET_VERSION} --install-dir /usr/share/dotnet \
    && ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
    && rm /tmp/dotnet-install.sh

ENV DOTNET_ROOT=/usr/share/dotnet \
    PATH="$PATH:/usr/share/dotnet"

# ============================================================
# 5. Pandoc
# ============================================================
RUN wget -qO /tmp/pandoc.deb \
        "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-1-amd64.deb" \
    && dpkg -i /tmp/pandoc.deb && rm /tmp/pandoc.deb

# ============================================================
# 6. Ruby (compiled from source → /usr/local, like Node/.NET)
#    Build deps installed in step 2.
# ============================================================
RUN curl -fsSL "https://cache.ruby-lang.org/pub/ruby/3.3/ruby-${RUBY_VERSION}.tar.gz" \
        -o /tmp/ruby.tar.gz \
    && tar -xzf /tmp/ruby.tar.gz -C /tmp \
    && cd /tmp/ruby-${RUBY_VERSION} \
    && ./configure --prefix=/usr/local --disable-install-doc \
    && make -j"$(nproc)" \
    && make install \
    && rm -rf /tmp/ruby*

# User-writable gem home (mirrors NPM_CONFIG_PREFIX pattern)
USER vscode
RUN mkdir -p /home/vscode/.gems/bin

ENV GEM_HOME=/home/vscode/.gems \
    GEM_PATH=/home/vscode/.gems \
    PATH="/home/vscode/.gems/bin:$PATH"

RUN gem install bundler -v ${BUNDLER_VERSION}

# ============================================================
# 7. Copy scripts & finalize
# ============================================================
USER root
COPY --chown=vscode:vscode setup.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/setup.sh

# User-writable npm global prefix so setup.sh can run global npm installs (e.g. updating npm) without sudo.
# The agent CLIs are installed root-owned under /usr/local further down.
RUN mkdir -p /home/vscode/.npm-global && chown vscode:vscode /home/vscode/.npm-global
ENV NPM_CONFIG_PREFIX=/home/vscode/.npm-global
ENV PATH="/home/vscode/.npm-global/bin:$PATH"

# ============================================================
# 8. Playwright — system deps for headless Chromium
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
        libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
        libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 \
        libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 \
        libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
        libxrandr2 xvfb \
        fonts-noto-color-emoji fonts-unifont libfontconfig1 libfreetype6 \
        xfonts-cyrillic xfonts-scalable fonts-liberation \
        fonts-ipafont-gothic fonts-wqy-zenhei fonts-tlwg-loma-otf \
        fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright CLI + test runner & Chromium as vscode user
USER vscode
RUN npm install -g playwright @playwright/test \
    && npx playwright install chromium
USER root

# ============================================================
# 9. Purge build-only tools
#    libcurl stays for git HTTP transport.
# ============================================================
RUN apt-get purge -y --auto-remove wget gnupg2 \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 10. Agent CLIs
#     Versions are the exact CLI package versions in the orchestrator's
#     package.json dependencies (passed by the generated compose overlay).
#     Installed root-owned under /usr/local so the agent cannot
#     replace or patch its own CLI.
# ============================================================
ARG CLAUDE_CODE_VERSION
ARG COPILOT_CLI_VERSION
RUN test -n "${CLAUDE_CODE_VERSION}" && test -n "${COPILOT_CLI_VERSION}" \
        || { echo "Build args CLAUDE_CODE_VERSION and COPILOT_CLI_VERSION are required" >&2; exit 1; } \
    && npm install -g --prefix /usr/local --allow-scripts=@anthropic-ai/claude-code \
        "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "@github/copilot@${COPILOT_CLI_VERSION}" \
    && npm cache clean --force \
    && /usr/local/bin/claude --version \
    && /usr/local/bin/copilot --version

USER vscode
WORKDIR /workspace
ENV DEBIAN_FRONTEND=dialog
