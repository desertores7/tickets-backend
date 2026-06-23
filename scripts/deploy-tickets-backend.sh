#!/usr/bin/env bash
# Despliega solo el servicio ticketera-api del compose del proyecto padre.
# No toca otros servicios del mismo docker-compose.yml.
#
# Variables (en el servidor o en el workflow de GitHub Actions):
#   DEPLOY_PATH      Ruta del proyecto con docker-compose.yml (ej. /docker/gemdam)
#   COMPOSE_SERVICE  Nombre del servicio en compose (default: ticketera-api)
#
# Uso manual en el servidor:
#   export DEPLOY_PATH=/docker/gemdam
#   bash ticketera-api/tickets-backend/scripts/deploy-tickets-backend.sh

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:?Define DEPLOY_PATH (directorio que contiene docker-compose.yml)}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-ticketera-api}"
TICKETS_DIR="${DEPLOY_PATH}/ticketera-api/tickets-backend"
COMPOSE_FILE="${DEPLOY_PATH}/docker-compose.yml"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "ERROR: No existe ${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ ! -d "${TICKETS_DIR}/.git" ]]; then
  echo "ERROR: No hay repo git en ${TICKETS_DIR}" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "ERROR: Instala docker compose o docker-compose" >&2
  exit 1
fi

echo "[deploy] 1/2 git pull — últimos cambios de main"
cd "${TICKETS_DIR}"
git checkout main 2>/dev/null || git checkout -B main
git pull --ff-only origin main

echo "[deploy] 2/2 Build y up solo ${COMPOSE_SERVICE} (--no-deps)"
cd "${DEPLOY_PATH}"
"${COMPOSE_CMD[@]}" build "${COMPOSE_SERVICE}"
"${COMPOSE_CMD[@]}" up -d --no-deps "${COMPOSE_SERVICE}"

echo "[deploy] Estado:"
"${COMPOSE_CMD[@]}" ps "${COMPOSE_SERVICE}"
