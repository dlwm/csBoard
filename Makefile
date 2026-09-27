SHELL := /bin/bash
NPX ?= npx
DOCKER ?= docker
COMPOSE ?= $(DOCKER) compose
.DEFAULT_GOAL := help

.PHONY: help resources nav-data map-export workers-build docker

help:
	@printf '%s\n' \
		'CSBoard commands:' \
		'  npm ci                              Install dependencies' \
		'  npm run dev                         Build and run the local web server' \
		'  npm run build                       Build the web frontend' \
		'  npm run dev:workers                 Run local Cloudflare Workers' \
		'  npm run deploy                      Deploy Cloudflare Workers' \
		'  npm run desktop:prepare             Build the local application' \
		'  npm run desktop:start               Open the existing application' \
		'  npm run desktop:dev                 Build and launch with DevTools' \
		'  npm run desktop:build:mac:arm64      Build Apple Silicon DMG (on macOS)' \
		'  npm run desktop:build:mac:x64        Build Intel DMG (on macOS)' \
		'  npm run desktop:build:win:x64        Build Windows amd64 installer (on Windows)' \
		'  make resources                      Download missing map resources' \
		'  make nav-data                       Regenerate bundled NAV data' \
		'  make map-export                     Export local VPK map resources' \
		'  make workers-build                  Build Workers without deploying' \
		'  make docker                         Build and start Docker services' \
		'Use docker compose down/logs/ps directly to manage containers.'

resources:
	node scripts/ensure-maps.js

nav-data:
	node scripts/generate-nav-data.js

map-export:
	bash scripts/export-map.sh

workers-build:
	@version="$$(scripts/resolve-build-version.sh)" && \
	VITE_BUILD_VERSION="$$version" $(NPX) wrangler deploy \
		--config config/cloudflare/wrangler.backend.jsonc --dry-run --outdir build/workers/backend && \
	VITE_BUILD_VERSION="$$version" $(NPX) wrangler deploy \
		--config config/cloudflare/wrangler.frontend.jsonc --dry-run --outdir build/workers/frontend

docker:
	@version="$$(scripts/resolve-build-version.sh)" && \
	BUILD_VERSION="$$version" $(COMPOSE) up --build -d
