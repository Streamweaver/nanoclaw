COMPOSE_FILE := compose.local.yml

.PHONY: up down restart logs infra status build

## Start infrastructure and run NanoClaw in foreground
up: infra
	npm run dev

## Start infrastructure (cloudflared tunnel)
infra:
	docker compose -f $(COMPOSE_FILE) up -d
	@echo "Infrastructure ready."

## Stop infrastructure containers
down:
	docker compose -f $(COMPOSE_FILE) down

## Restart infrastructure and NanoClaw
restart: down up

## Tail infrastructure logs
logs:
	docker compose -f $(COMPOSE_FILE) logs -f

## Show container status
status:
	docker compose -f $(COMPOSE_FILE) ps

## Rebuild the agent container image
build:
	./container/build.sh
