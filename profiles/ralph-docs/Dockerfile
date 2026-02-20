FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# ============================================================
# Version pinning – single place to bump dependencies
# ============================================================
ARG NODE_MAJOR=24
ARG RUBY_VERSION=3.3.8
ARG BUNDLER_VERSION=2.6.9
ARG DOTNET_VERSION=10.0
ARG PANDOC_VERSION=3.8.3

ENV DEBIAN_FRONTEND=noninteractive

# ============================================================
# 0. Locale — Ruby defaults to US-ASCII without this, causing
#    "invalid byte sequence" errors on UTF-8 content files
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends locales \
    && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8

# ============================================================
# 1. Core build deps + Playwright system libraries
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential ca-certificates curl gnupg2 lsb-release \
        software-properties-common wget apt-transport-https unzip jq \
        # Playwright Chromium / Firefox / WebKit runtime deps
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
        libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 \
        libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
        libasound2 libatspi2.0-0 libwayland-client0 \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 2. Microsoft package signing key
# ============================================================
RUN curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
        | tee /etc/apt/trusted.gpg.d/microsoft.asc > /dev/null

# ============================================================
# 3. Node.js (via NodeSource)
# ============================================================
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y nodejs \
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
# 6. Playwright browser (Chromium only)
# ============================================================
RUN npm install -g playwright@1.58.2 \
    && npx playwright install chromium \
    && npx playwright install-deps chromium

# ============================================================
# 7. RVM + Ruby (as vscode user)
# ============================================================
USER vscode

RUN gpg2 --keyserver hkp://keyserver.ubuntu.com --recv-keys \
        409B6B1796C275462A1703113804BB82D39DC0E3 \
        7D2BAF1CF37B13E2069D6956105BD0E739499BDB \
    || (curl -sSL https://rvm.io/mpapis.asc | gpg2 --import - \
     && curl -sSL https://rvm.io/pkuczynski.asc | gpg2 --import -)

RUN curl -sSL https://get.rvm.io | bash -s stable \
    && echo 'source ~/.rvm/scripts/rvm' >> ~/.bashrc \
    && echo 'source ~/.rvm/scripts/rvm' >> ~/.bash_profile \
    && echo 'source ~/.rvm/scripts/rvm' >> ~/.profile \
    && /bin/bash -l -c "rvm install ${RUBY_VERSION}" \
    && /bin/bash -l -c "rvm use ${RUBY_VERSION} --default" \
    && /bin/bash -l -c "gem install bundler -v ${BUNDLER_VERSION}"

RUN echo '#!/bin/bash' > /home/vscode/.rvmrc_wrapper \
    && echo 'source ~/.rvm/scripts/rvm' >> /home/vscode/.rvmrc_wrapper \
    && echo 'exec "$@"' >> /home/vscode/.rvmrc_wrapper \
    && chmod +x /home/vscode/.rvmrc_wrapper

ENV BASH_ENV="/home/vscode/.rvm/scripts/rvm" \
    PATH="/home/vscode/.rvm/gems/ruby-${RUBY_VERSION}/bin:/home/vscode/.rvm/gems/ruby-${RUBY_VERSION}@global/bin:/home/vscode/.rvm/rubies/ruby-${RUBY_VERSION}/bin:/home/vscode/.rvm/bin:$PATH" \
    GEM_HOME="/home/vscode/.rvm/gems/ruby-${RUBY_VERSION}" \
    GEM_PATH="/home/vscode/.rvm/gems/ruby-${RUBY_VERSION}:/home/vscode/.rvm/gems/ruby-${RUBY_VERSION}@global" \
    RUBY_VERSION="ruby-${RUBY_VERSION}"

# ============================================================
# 8. Copy scripts & finalize
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

# Remove HTTP client binaries (only needed during build, not at runtime).
# libcurl stays for git HTTP transport; agent cannot use curl/wget directly.
RUN apt-get purge -y --auto-remove curl wget && rm -rf /var/lib/apt/lists/*

USER vscode
WORKDIR /workspace
ENV DEBIAN_FRONTEND=dialog
