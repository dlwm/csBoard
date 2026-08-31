SHELL := /bin/bash
NPM ?= npm
NPX ?= npx

.DEFAULT_GOAL := help

.PHONY: help setup install resources build frontend-build backend-build workers-build dev node-dev workers-dev workers-deploy clean

help:
	@printf '%s\n' \
		'CSBoard developer commands:' \
		'' \
		'  make setup              Install dependencies and download map resources' \
		'  make install            Install npm dependencies' \
		'  make resources          Download missing local NAV/GLB map resources' \
		'  make build              Build all frontend, Node.js, and Workers outputs' \
		'  make frontend-build     Build the Vite frontend into dist/' \
		'  make backend-build      Validate the Node.js Runtime adapter and shared core' \
		'  make workers-build      Build and validate the Cloudflare Workers bundle' \
		'  make dev                Build and run the default Node.js Runtime adapter' \
		'  make node-dev           Build and run the Node.js Runtime adapter' \
		'  make workers-dev        Run the Cloudflare Workers Runtime locally' \
		'  make workers-deploy     Build and deploy to Cloudflare Workers' \
		'  make clean              Remove generated frontend and Wrangler files'

setup: install resources

install:
	$(NPM) install

resources:
	node scripts/ensure-maps.js

build: frontend-build backend-build workers-build

frontend-build:
	$(NPM) run build

backend-build:
	node --check server/node.js
	node --check server/core/http.js
	node --check server/core/yjs.js

workers-build:
	$(NPX) wrangler deploy --config wrangler.backend.jsonc --dry-run --outdir build/workers/backend
	$(NPX) wrangler deploy --config wrangler.frontend.jsonc --dry-run --outdir build/workers/frontend

node-dev: backend-build
	VITE_USE_LOCAL_MAPS=true VITE_BACKEND_BASE_URL=/ $(NPM) run build
	node server/node.js

dev: node-dev

workers-dev:
	$(NPM) run dev:workers

workers-deploy:
	bash scripts/deploy-cloudflare.sh

clean:
	rm -rf dist build .wrangler
