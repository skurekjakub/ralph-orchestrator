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
# 2. Microsoft packages – PowerShell & sqlcmd
# ============================================================
RUN curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
        | tee /etc/apt/trusted.gpg.d/microsoft.asc > /dev/null \
    && wget -qO /tmp/ms.deb \
        "https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb" \
    && dpkg -i /tmp/ms.deb && rm /tmp/ms.deb \
    && apt-get update \
    && apt-get install -y powershell \
    && ACCEPT_EULA=Y apt-get install -y mssql-tools18 unixodbc-dev \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="$PATH:/opt/mssql-tools18/bin"

# ============================================================
# 3. Node.js (via NodeSource)
# ============================================================
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 5. .NET SDK (via official install script)
# ============================================================
RUN wget -qO /tmp/dotnet-install.sh https://dot.net/v1/dotnet-install.sh \
    && chmod +x /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --channel ${DOTNET_VERSION} --install-dir /usr/share/dotnet \
    && ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
    && rm /tmp/dotnet-install.sh

ENV DOTNET_ROOT=/usr/share/dotnet \
    PATH="$PATH:/usr/share/dotnet"

# ============================================================
# 6. GitHub CLI
# ============================================================
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
        https://cli.github.com/packages stable main" \
        | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 7. Azure CLI
# ============================================================
RUN curl -fsSL https://aka.ms/InstallAzureCLIDeb | bash \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# 8. Docker CLI + Compose plugin (docker-outside-of-docker)
# ============================================================
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) \
        signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
        https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -f docker && usermod -aG docker vscode

# ============================================================
# 9. Pandoc
# ============================================================
RUN wget -qO /tmp/pandoc.deb \
        "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-1-amd64.deb" \
    && dpkg -i /tmp/pandoc.deb && rm /tmp/pandoc.deb

# ============================================================
# 10. Playwright browsers (global install, all engines)
# ============================================================
RUN npm install -g playwright@latest \
    && npx playwright install chromium firefox webkit \
    && npx playwright install-deps

# ============================================================
# 11. RVM + Ruby (as vscode user)
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
# 12. Copy scripts & finalize
# ============================================================
USER root
COPY --chown=vscode:vscode setup.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/setup.sh

USER vscode
WORKDIR /workspace
ENV DEBIAN_FRONTEND=dialog
