#!/usr/bin/env bash
# Despliega solo el servicio showpass-api del compose del proyecto padre.
# No toca otros servicios del mismo docker-compose.yml.
#
# Variables (en el servidor o en el workflow de GitHub Actions):
#   DEPLOY_PATH      Ruta del proyecto con docker-compose.yml (ej. /docker/showpass)
#   COMPOSE_SERVICE  Nombre del servicio en compose (default: showpass-api)
#
# Uso manual en el servidor:
#   export DEPLOY_PATH=/docker/showpass
#   bash showpass-api/tickets-backend/scripts/deploy-tickets-backend.sh

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:?Define DEPLOY_PATH (directorio que contiene docker-compose.yml)}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-showpass-api}"
TICKETS_DIR="${DEPLOY_PATH}/showpass-api/tickets-backend"
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

# Espera a que todas las instancias del servicio estén `healthy` (el healthcheck
# del Dockerfile pega a /health). Sin esto, el reemplazo progresivo seguiría de
# largo y podría dejar varias instancias arrancando a la vez, que es lo mismo
# que recrearlas juntas.
wait_until_healthy() {
  local intentos=0
  while (( intentos < 60 )); do
    local ids sanas total
    ids=$("${COMPOSE_CMD[@]}" ps -q "${COMPOSE_SERVICE}")
    total=$(echo "${ids}" | grep -c . || true)
    sanas=$(docker inspect --format '{{.State.Health.Status}}' ${ids} 2>/dev/null | grep -c '^healthy$' || true)
    if [[ "${total}" -gt 0 && "${sanas}" -eq "${total}" ]]; then
      return 0
    fi
    sleep 2
    intentos=$(( intentos + 1 ))
  done

  echo "ERROR: alguna instancia de ${COMPOSE_SERVICE} no llegó a healthy" >&2
  "${COMPOSE_CMD[@]}" ps "${COMPOSE_SERVICE}" >&2
  exit 1
}

echo "[deploy] 1/4 git pull — últimos cambios de main"
cd "${TICKETS_DIR}"
git checkout main 2>/dev/null || git checkout -B main
git pull --ff-only origin main

echo "[deploy] 2/4 Build de ${COMPOSE_SERVICE}"
cd "${DEPLOY_PATH}"
"${COMPOSE_CMD[@]}" build "${COMPOSE_SERVICE}"

# Migraciones pendientes, con la imagen recién construida y ANTES de reemplazar
# el contenedor. `migration:run` solo aplica las que falten en la tabla
# `migrations`; si no hay ninguna, no hace nada.
#
# El orden importa: si el código nuevo arranca antes que su migración, cada
# consulta a una columna nueva falla ("Unknown column ...") y la API queda caída
# hasta que alguien la corra a mano. Ya pasó. Corriéndola acá, si la migración
# falla, `set -e` corta el deploy y el contenedor anterior sigue atendiendo.
#
# `run --rm` levanta un contenedor descartable con el mismo env, red y volúmenes
# del servicio; `--no-deps` no toca otros servicios; `-T` porque por SSH no hay
# TTY. Una migración tiene que ser compatible con el código viejo, que sigue
# vivo mientras corre (agregar columnas sí; renombrar o borrar, en dos pasos).
echo "[deploy] 3/4 Migraciones pendientes"
"${COMPOSE_CMD[@]}" run --rm --no-deps -T -e NODE_ENV=production "${COMPOSE_SERVICE}" \
  node node_modules/typeorm/cli.js migration:run -d dist/config/db/data-source.js

# Reemplazo de a una instancia (`deploy.replicas` en el compose): mientras se
# recrea una, nginx reparte entre las otras y el sitio no se cae. Recrear las
# seis juntas deja ~15 segundos sin servicio, justo el rato en que alguien puede
# estar pagando.
#
# Cómo funciona: se borra una vieja y se llama a `up` con `--no-recreate`, que
# crea solo la que falta —con la imagen nueva— y no toca las que siguen
# atendiendo. Se repite hasta reemplazarlas todas.
echo "[deploy] 4/4 Reemplazo progresivo de ${COMPOSE_SERVICE}"
OLD_CONTAINERS=$("${COMPOSE_CMD[@]}" ps -q "${COMPOSE_SERVICE}" || true)

if [[ -z "${OLD_CONTAINERS}" ]]; then
  "${COMPOSE_CMD[@]}" up -d --no-deps "${COMPOSE_SERVICE}"
else
  for container in ${OLD_CONTAINERS}; do
    echo "[deploy]   reemplazando ${container:0:12}…"
    docker rm -f "${container}" >/dev/null
    "${COMPOSE_CMD[@]}" up -d --no-deps --no-recreate "${COMPOSE_SERVICE}"
    wait_until_healthy
  done
fi

echo "[deploy] Estado:"
"${COMPOSE_CMD[@]}" ps "${COMPOSE_SERVICE}"
