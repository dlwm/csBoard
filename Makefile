SHELL := bash
NODE ?= node
NPM ?= npm
DOCKER ?= docker
COMPOSE ?= $(DOCKER) compose -f config/docker/compose.yml
# Extra CLI flags, for example: make deploy ARGS=--dry-run
ARGS ?=
PLATFORM ?=
BUMP ?=
VERSION ?=
.DEFAULT_GOAL := help

.PHONY: help install lint dev dev-workers server deploy build build-remote \
	desktop-start desktop-dev desktop-prepare desktop-build-mac-arm64 \
	desktop-build-mac-x64 desktop-build-win-x64 native-build \
	mobile-prepare mobile-open mobile-build version version-sync version-check \
	resources nav-data map-export workers-build wrangler docker

help:
	@printf '%s\n' \
		'CSBoard — make <command> [ARGS="extra flags"]' \
		'  install                      Install locked dependencies' \
		'  lint                         Check architecture boundaries' \
		'  dev / server                 Build and serve / serve existing frontend' \
		'  build / build-remote         Build local / remote frontend' \
		'  desktop-prepare              Build the local desktop application' \
		'  desktop-start / desktop-dev  Open existing app / build and debug' \
		'  desktop-build-mac-arm64      Package Apple Silicon DMG (macOS)' \
		'  desktop-build-mac-x64        Package Intel DMG (macOS)' \
		'  desktop-build-win-x64        Package Windows amd64 installer (Windows)' \
		'  native-build                 Build native components' \
		'  mobile-prepare / mobile-open / mobile-build PLATFORM=ios|android' \
		'  version                      Select major, minor, patch or custom version' \
		'  version BUMP=patch           Noninteractive bump (major|minor|patch)' \
		'  version VERSION=1.20.1       Set a specific version' \
		'  version-sync / version-check Synchronize / check derived versions' \
		'  dev-workers / workers-build Run Workers locally / bundle without publishing' \
		'  deploy                      Authorize and deploy Workers' \
		'  wrangler ARGS="whoami"       Run the installed Wrangler CLI' \
		'  resources / nav-data / map-export  Prepare map resources' \
		'  docker                       Build and start Docker services' \
		'Container management: docker compose -f config/docker/compose.yml down/logs/ps'

install:
	$(NPM) ci $(ARGS)

lint:
	$(NODE) scripts/check-architecture.js

dev: build
	$(NODE) server/node.js $(ARGS)

server:
	$(NODE) server/node.js $(ARGS)

dev-workers:
	$(NODE) scripts/dev-workers.js $(ARGS)

deploy:
	$(NODE) scripts/cloudflare-deployment.js $(ARGS)

build:
	$(NODE) scripts/build-frontend.js $(ARGS)

build-remote:
	$(NODE) scripts/build-frontend.js --remote $(ARGS)

desktop-start:
	$(NODE) scripts/start-desktop.js $(ARGS)

desktop-dev desktop-prepare desktop-build-mac-arm64 desktop-build-mac-x64 desktop-build-win-x64:
	$(NODE) scripts/package-desktop.js $(patsubst desktop-%,%,$(patsubst desktop-build-%,%,$@)) $(ARGS)

native-build:
	$(NODE) scripts/build-native.js $(ARGS)

mobile-prepare mobile-open mobile-build:
	$(NODE) scripts/mobile.js $(patsubst mobile-%,%,$@) "$(PLATFORM)" $(ARGS)

version:
	@$(NODE) scripts/change-version.js "$(BUMP)" "$(VERSION)"

version-sync:
	$(NODE) scripts/sync-version.js

version-check:
	$(NODE) scripts/sync-version.js --check

resources:
	$(NODE) scripts/ensure-maps.js $(ARGS)

nav-data:
	$(NODE) scripts/generate-nav-data.js $(ARGS)

map-export:
	bash scripts/export-map.sh $(ARGS)

wrangler:
	$(NODE) node_modules/wrangler/bin/wrangler.js $(ARGS)

workers-build:
	$(NODE) scripts/build-go-parser.js
	@version="$$(scripts/resolve-build-version.sh)" && \
	VITE_BUILD_VERSION="$$version" $(NODE) node_modules/wrangler/bin/wrangler.js deploy \
		--config config/cloudflare/wrangler.backend.jsonc --define __CSBOARD_AI_ENABLED__:$${CF_AI_ENABLED:-false} --dry-run --outdir build/workers/backend && \
	VITE_BUILD_VERSION="$$version" $(NODE) node_modules/wrangler/bin/wrangler.js deploy \
		--config config/cloudflare/wrangler.frontend.jsonc --dry-run --outdir build/workers/frontend

docker:
	@version="$$(scripts/resolve-build-version.sh)" && \
	BUILD_VERSION="$$version" $(COMPOSE) up --build -d
