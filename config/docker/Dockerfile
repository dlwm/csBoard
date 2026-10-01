FROM golang:1.27-bookworm AS go-toolchain

FROM node:24-bookworm-slim AS builder
COPY --from=go-toolchain /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}"
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ARG BUILD_VERSION=v1.18.0
ARG CSBOARD_AI_ENABLED=true
ENV CSBOARD_AI_ENABLED=$CSBOARD_AI_ENABLED

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN printf '%s\n' "$BUILD_VERSION" > .build-version \
    && VITE_BUILD_VERSION="$BUILD_VERSION" npm run build

RUN if [ "$CSBOARD_AI_ENABLED" = "false" ]; then \
      rm server/core/ai.js shared/ai-protocol.js shared/ai-providers.js; \
    fi

RUN node --check server/node.js \
    && node --check server/core/http.js \
    && node --check server/core/yjs.js


FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/build/go-parser/web ./build/go-parser/web
COPY --from=builder /app/shared ./shared
COPY LICENSE ./
COPY docs/THIRD_PARTY_NOTICES.md ./

EXPOSE 3000

CMD ["node", "server/node.js"]
