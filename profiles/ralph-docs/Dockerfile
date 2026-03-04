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
        curl jq gnupg2 wget \
        libssl-dev libyaml-dev libreadline-dev libffi-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 3. Node.js (via NodeSource)
# ============================================================
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
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

# User-writable npm global prefix so setup.sh can install CLIs without sudo
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

# Install Playwright + Chromium as vscode user into npm-global prefix
USER vscode
RUN npm install -g playwright \
    && npx playwright install chromium
USER root

# ============================================================
# 9. Purge build-only tools
#    curl/wget were needed to fetch install scripts.
#    gnupg2 needed for NodeSource GPG key.
#    libcurl stays for git HTTP transport.
# ============================================================
RUN apt-get purge -y --auto-remove curl wget gnupg2 \
    && rm -rf /var/lib/apt/lists/*

USER vscode
WORKDIR /workspace
ENV DEBIAN_FRONTEND=dialog
