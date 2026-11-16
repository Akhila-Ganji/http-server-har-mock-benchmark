FROM node:20-bookworm@sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      git \
      tmux \
      procps \
      ripgrep \
      python3 \
      curl \
 && rm -rf /var/lib/apt/lists/*

# = task.toml metadata.source.base_sha = tests/checks.toml base_ref
ARG BASE_SHA=0d3b7bb5b6e8a59fd450ae2dca65870009cfcd8b
WORKDIR /root/repos/http-server

RUN git init -q -b master \
 && git fetch -q --depth 1 https://github.com/http-party/http-server.git "$BASE_SHA" \
 && git checkout -q -B master FETCH_HEAD \
 && rm .git/FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$BASE_SHA"

RUN (npm ci --no-audit --no-fund || npm install --no-audit --no-fund) \
 && echo "node_modules" >> .git/info/exclude \
 && test -z "$(git status --porcelain)"
