COMPOSE_FILE := compose.local.yml
PID_FILE     := .nanoclaw.pid
LOG_FILE     := logs/nanoclaw.log

.PHONY: up down restart status logs build infra stop start kill-agents

## Start infrastructure and NanoClaw
up: infra start

## Start NanoClaw (foreground)
start:
	@mkdir -p logs
	npm run dev

## Stop NanoClaw and all agent containers
stop: kill-agents
	@pid=$$(ps -eo pid,cmd | grep 'tsx src/index[.]ts' | grep -v grep | awk '{print $$1}' | head -1); \
	if [ -n "$$pid" ]; then \
		kill $$pid 2>/dev/null; sleep 1; \
		kill -0 $$pid 2>/dev/null && kill -9 $$pid 2>/dev/null; \
		echo "NanoClaw stopped (pid $$pid)"; \
	else \
		echo "NanoClaw not running"; \
	fi
	@rm -f $(PID_FILE)

## Stop everything (NanoClaw + agents + infrastructure)
down: stop
	docker compose -f $(COMPOSE_FILE) down

## Restart everything
restart: down up

## Start infrastructure (cloudflared tunnel)
infra:
	docker compose -f $(COMPOSE_FILE) up -d
	@echo "Infrastructure ready."

## Kill orphaned agent containers
kill-agents:
	@containers=$$(docker ps -q --filter "name=nanoclaw-" 2>/dev/null); \
	if [ -n "$$containers" ]; then \
		docker stop $$containers && echo "Agent containers stopped"; \
	else \
		echo "No agent containers running"; \
	fi

## Show status of all components
status:
	@echo "=== NanoClaw ==="
	@pid=$$(ps -eo pid,cmd | grep 'tsx src/index[.]ts' | grep -v grep | awk '{print $$1}' | head -1); \
	if [ -n "$$pid" ]; then \
		echo "  Running (pid $$pid)"; \
	else \
		echo "  Not running"; \
	fi
	@echo ""
	@echo "=== Infrastructure ==="
	@docker compose -f $(COMPOSE_FILE) ps 2>/dev/null || echo "  Not running"
	@echo ""
	@echo "=== Agent Containers ==="
	@docker ps --filter "name=nanoclaw-" --format "  {{.Names}}  {{.Status}}" 2>/dev/null || echo "  None"

## Tail NanoClaw logs
logs:
	@if [ -f $(LOG_FILE) ]; then \
		tail -f $(LOG_FILE); \
	else \
		echo "No log file. NanoClaw logs to stderr when run in foreground."; \
	fi

## Rebuild the agent container image
build:
	./container/build.sh
