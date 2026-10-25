# Runs the clinbuddy TUI inside a Debian container, built from this checkout.
#
# Build (from the repo root):
#   docker build -t clindroidbuddy:0.1.0 .
#
# Multi-platform build for linux/amd64 and linux/arm64 (Docker Desktop with the
# containerd image store; the non-native platform is emulated, so it is slow):
#   docker buildx build --platform linux/amd64,linux/arm64 -t clindroid/clindroidbuddy:0.1.0 --load .
#   docker push clindroid/clindroidbuddy:0.1.0
#
# Run from a study folder that holds the compose.yaml shown in
# https://clindroid.com/products/buddy/docs/getting-started, then start clinbuddy from the shell it opens:
#   docker compose -f compose.yaml run --rm clinbuddy
#
# For RAG through the llamacpp embedding provider, llama-server is on PATH and
# the nomic-embed-text-v1.5 GGUF model is bundled; set the provider's modelPath to
# /usr/local/share/clindroidbuddy/models/nomic-embed-text-v1.5/nomic-embed-text-v1.5.f16.gguf.
# Third-party license notices are in /usr/share/doc/clindroidbuddy.

ARG BUN_VERSION=1.3.11
ARG DEBIAN_VERSION=trixie
ARG LLAMA_CPP_VERSION=b11567
# Pinned to a commit of nomic-ai/nomic-embed-text-v1.5-GGUF; the sha256 is the
# file's LFS hash at that commit.
ARG NOMIC_EMBED_REVISION=0188c9bf409793f810680a5a431e7b899c46104c
ARG NOMIC_EMBED_FILE=nomic-embed-text-v1.5.f16.gguf
ARG NOMIC_EMBED_SHA256=f7af6f66802f4df86eda10fe9bbcfc75c39562bed48ef6ace719a251cf1c2fdb

# llama-server backs the llamacpp embedding provider for RAG, which spawns it as
# a child process. Debian does not package llama.cpp, so build it from a pinned
# release tag. GGML_NATIVE=OFF keeps the binary portable across host CPUs.
FROM debian:${DEBIAN_VERSION}-slim AS llama

ARG LLAMA_CPP_VERSION
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential ca-certificates cmake git \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${LLAMA_CPP_VERSION}" https://github.com/ggml-org/llama.cpp /llama.cpp \
  && cmake -S /llama.cpp -B /llama.cpp/build \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DGGML_NATIVE=OFF \
    -DLLAMA_CURL=OFF \
    -DLLAMA_OPENSSL=OFF \
  && cmake --build /llama.cpp/build --target llama-server -j"$(nproc)" \
  && cp /llama.cpp/build/bin/llama-server /llama-server

# nomic-embed-text-v1.5 (Apache License 2.0, Nomic AI), redistributed unmodified
# as published, with the license text and model card it is distributed under.
FROM debian:${DEBIAN_VERSION}-slim AS embed

ARG NOMIC_EMBED_REVISION
ARG NOMIC_EMBED_FILE
ARG NOMIC_EMBED_SHA256
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /embed
RUN base="https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/${NOMIC_EMBED_REVISION}" \
  && curl -fsSL --retry 5 --retry-all-errors -o "${NOMIC_EMBED_FILE}" "${base}/${NOMIC_EMBED_FILE}" \
  && echo "${NOMIC_EMBED_SHA256}  ${NOMIC_EMBED_FILE}" | sha256sum -c - \
  && curl -fsSL --retry 5 --retry-all-errors -o README.md "${base}/README.md" \
  && curl -fsSL --retry 5 --retry-all-errors -o LICENSE https://www.apache.org/licenses/LICENSE-2.0.txt

FROM debian:${DEBIAN_VERSION}-slim AS build

ARG BUN_VERSION
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}" \
  && bun --version

# Script.version would otherwise ask git for the branch name; the checkout's
# .git is not part of the build context.
ENV CLINBUDDY_CHANNEL=latest

WORKDIR /src
COPY . .
# Lifecycle scripts only compile native tree-sitter addons, but the binary
# loads the grammars' .wasm files instead, so skip them.
RUN bun install --frozen-lockfile --ignore-scripts
# --single: native binary for the build platform only.
# --skip-install: the cross-platform reinstall is only needed for --single-less builds.
RUN bun run --cwd packages/clindroidbuddy build --single --skip-install \
  && cp packages/clindroidbuddy/dist/clindroidbuddy-linux-*/bin/clinbuddy /clinbuddy

FROM debian:${DEBIAN_VERSION}-slim

ARG DEBIAN_FRONTEND=noninteractive
ARG UID=1000
ARG GID=1000

# R and the packages the built-in skills generate code against come from the
# Debian archive as prebuilt binaries. build-essential and r-base-dev (gfortran,
# BLAS/LAPACK headers) let renv::restore() compile CRAN source packages that
# carry C/C++/Fortran code. tini is PID 1 so spawned llama-server processes are
# reaped.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    less \
    libgomp1 \
    ripgrep \
    r-base-core \
    r-base-dev \
    r-cran-devtools \
    r-cran-haven \
    r-cran-here \
    r-cran-httr2 \
    r-cran-jsonlite \
    r-cran-openxlsx \
    r-cran-rcurl \
    r-cran-renv \
    r-cran-roxygen2 \
    r-cran-testthat \
    r-cran-tidyverse \
    r-cran-writexl \
    r-cran-xml \
    tini \
  && rm -rf /var/lib/apt/lists/*

# r2rtf is not packaged by Debian.
RUN Rscript -e 'install.packages("r2rtf", repos = "https://cloud.r-project.org", lib = .Library.site[1])' \
  && Rscript -e 'library(r2rtf)'

COPY --from=llama /llama-server /usr/local/bin/llama-server
COPY --from=embed /embed /usr/local/share/clindroidbuddy/models/nomic-embed-text-v1.5
COPY LICENSE LICENSE-MIT THIRD_PARTY_NOTICES.md /usr/share/doc/clindroidbuddy/
COPY --from=build /clinbuddy /usr/local/bin/clinbuddy

RUN groupadd -g ${GID} buddy \
  && useradd -m -u ${UID} -g ${GID} -s /bin/bash buddy \
  && mkdir -p /workspace \
    /home/buddy/.local/share/clindroidbuddy \
    /home/buddy/.config/clindroidbuddy \
  && chown -R buddy:buddy /workspace /home/buddy

USER buddy
WORKDIR /workspace

ENV TERM=xterm-256color \
  COLORTERM=truecolor \
  LANG=C.UTF-8 \
  BUN_RUNTIME_TRANSPILER_CACHE_PATH=0

RUN clinbuddy --version

ENTRYPOINT ["tini", "--", "clinbuddy"]
