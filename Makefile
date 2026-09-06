SHELL := /bin/bash

NPM ?= npm
NPX ?= npx
DOCKER ?= docker
COMPOSE ?= $(DOCKER) compose

.DEFAULT_GOAL := help

.PHONY: \
	help \
	setup install resources nav-data map-export \
	build build-version frontend-build backend-build workers-build \
	dev node-dev workers-dev workers-deploy \
	docker docker-build docker-up docker-down docker-restart docker-logs docker-ps docker-clean \
	clean

help:
	@printf '%s\n' \
		'CSBoard developer commands:' \
		'' \
		'Setup:' \
		'  make setup              Install dependencies and download map resources' \
		'  make install            Install npm dependencies' \
		'  make resources          Download missing local NAV/GLB map resources' \
		'  make nav-data           Rebuild bundled NAV JSON from .local/maps' \
		'  make map-export         Export NAV/GLB map resources from local VPK files' \
		'' \
		'Build:' \
		'  make build              Build all frontend, Node.js, and Workers outputs' \
		'  make frontend-build     Build the Vite frontend into dist/' \
		'  make backend-build      Validate the Node.js Runtime adapter and shared core' \
		'  make workers-build      Build and validate the Cloudflare Workers bundle' \
		'' \
		'Development:' \
		'  make dev                Build and run the default Node.js Runtime adapter' \
		'  make node-dev           Build and run the Node.js Runtime adapter' \
		'  make workers-dev        Run the Cloudflare Workers Runtime locally' \
		'  make workers-deploy     Build and deploy to Cloudflare Workers' \
		'' \
		'Docker:' \
		'  make docker             Build and start CSBoard with Docker' \
		'  make docker-build       Build Docker images' \
		'  make docker-up          Start Docker services' \
		'  make docker-down        Stop Docker services' \
		'  make docker-restart     Restart Docker services' \
		'  make docker-logs        Follow Docker service logs' \
		'  make docker-ps          Show Docker service status' \
		'  make docker-clean       Stop services and remove local Docker images' \
		'' \
		'Cleanup:' \
		'  make clean              Remove generated frontend and Wrangler files'

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------

setup: install resources

install:
	$(NPM) install

resources:
	node scripts/ensure-maps.js

nav-data:
	node scripts/generate-nav-data.js

map-export:
	bash scripts/export-map.sh

# -----------------------------------------------------------------------------
# Build
# -----------------------------------------------------------------------------

build: frontend-build backend-build workers-build

build-version:
	@scripts/resolve-build-version.sh > .build-version

frontend-build: build-version
	VITE_BUILD_VERSION="$$(< .build-version)" $(NPM) run build

backend-build: build-version
	node --check server/node.js
	node --check server/core/http.js
	node --check server/core/yjs.js

workers-build: build-version
	VITE_BUILD_VERSION="$$(< .build-version)" $(NPX) wrangler deploy \
		--config wrangler.backend.jsonc \
		--dry-run \
		--outdir build/workers/backend

	VITE_BUILD_VERSION="$$(< .build-version)" $(NPX) wrangler deploy \
		--config wrangler.frontend.jsonc \
		--dry-run \
		--outdir build/workers/frontend

# -----------------------------------------------------------------------------
# Development
# -----------------------------------------------------------------------------

node-dev: backend-build frontend-build
	node server/node.js

dev: node-dev

workers-dev: build-version
	VITE_BUILD_VERSION="$$(< .build-version)" $(NPM) run dev:workers

workers-deploy: build-version
	VITE_BUILD_VERSION="$$(< .build-version)" bash scripts/deploy-cloudflare.sh

# -----------------------------------------------------------------------------
# Docker
# -----------------------------------------------------------------------------

docker: docker-build docker-up

docker-build:
	$(COMPOSE) build \
		--build-arg BUILD_VERSION="$$(scripts/resolve-build-version.sh)"

docker-up:
	$(COMPOSE) up -d

docker-down:
	$(COMPOSE) down

docker-restart:
	$(COMPOSE) restart

docker-logs:
	$(COMPOSE) logs -f

docker-ps:
	$(COMPOSE) ps

docker-clean:
	$(COMPOSE) down --rmi local --remove-orphans

# -----------------------------------------------------------------------------
# Cleanup
# -----------------------------------------------------------------------------

clean:
	rm -rf dist build .wrangler .build-version
