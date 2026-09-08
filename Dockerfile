FROM node:22-bookworm-slim AS builder

WORKDIR /app
ARG BUILD_VERSION=v1.13.1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN printf '%s\n' "$BUILD_VERSION" > .build-version \
    && VITE_BUILD_VERSION="$BUILD_VERSION" npm run build

RUN node --check server/node.js \
    && node --check server/core/http.js \
    && node --check server/core/yjs.js


FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

EXPOSE 3000

CMD ["node", "server/node.js"]
