FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN scripts/resolve-build-version.sh > .build-version \
    && VITE_BUILD_VERSION="$(cat .build-version)" npm run build

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
COPY --from=builder /app/src ./src

EXPOSE 3000

CMD ["node", "server/node.js"]