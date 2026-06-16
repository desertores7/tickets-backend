#!/bin/bash

# ============================================================================
# Script de despliegue para producción - MultiChat Backend
# ============================================================================
# Orden correcto: STOP → WAIT → BUILD → UP
# 
# Uso:
#   ./deploy-prod.sh                    # En el directorio actual
#   ./deploy-prod.sh /ruta/al/proyecto  # Especificando directorio
#
# Funcionalidades:
#   - Detiene contenedores existentes
#   - Crea backups automáticos
#   - Limpia espacio en disco
#   - Construye nueva imagen
#   - Levanta contenedor nuevo
#   - Verifica salud del servidor
#   - Muestra estadísticas y logs
#
# Autor: MultiChat Team
# Fecha: $(date +%Y-%m-%d)
# ============================================================================

set -e

# Configuración de directorio
PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

echo "🚀 Despliegue de MultiChat Backend..."
echo "📁 Directorio: $PROJECT_DIR"

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuración
CONTAINER_NAME="multichat-backend-v2"
COMPOSE_FILE="docker-compose.yml"
LOG_FILE="deploy.log"
BACKUP_DIR="backups"

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Función para logging
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Función para limpiar overlays bloqueados
cleanup_blocked_overlays() {
    echo -e "${BLUE}🔧 Limpiando overlays bloqueados...${NC}"
    
    # Buscar todos los overlays montados que puedan estar bloqueados
    # Específicamente buscar overlays en virtfs (típico de este VPS)
    mount | grep overlay2 | grep -E "(virtfs|merged)" | while read -r mount_line; do
        # Extraer la ruta del merged (columna 3)
        merged_path=$(echo "$mount_line" | awk '{print $3}')
        
        if [ -n "$merged_path" ]; then
            # Verificar si es un overlay del contenedor o uno bloqueado
            # Si el overlay tiene "(deleted)" en el mount o es de virtfs, probablemente está bloqueado
            if echo "$mount_line" | grep -q "deleted" || echo "$mount_line" | grep -q "virtfs"; then
                echo "  ⚠️  Desmontando overlay bloqueado: $merged_path"
                sudo umount -l "$merged_path" 2>/dev/null || sudo umount -f "$merged_path" 2>/dev/null || true
                log "Overlay desmontado: $merged_path"
            fi
        fi
    done
    
    # También intentar encontrar overlays por ID del contenedor si existe
    if docker inspect ${CONTAINER_NAME} &>/dev/null; then
        CONTAINER_ID=$(docker inspect -f '{{.Id}}' ${CONTAINER_NAME} 2>/dev/null || echo "")
        
        if [ -n "$CONTAINER_ID" ]; then
            # Buscar cualquier overlay relacionado con este contenedor
            mount | grep overlay2 | grep "$CONTAINER_ID" | while read -r mount_line; do
                merged_path=$(echo "$mount_line" | awk '{print $3}')
                if [ -n "$merged_path" ]; then
                    echo "  ⚠️  Desmontando overlay del contenedor: $merged_path"
                    sudo umount -l "$merged_path" 2>/dev/null || true
                    log "Overlay del contenedor desmontado: $merged_path"
                fi
            done
        fi
    fi
    
    echo "  ✓ Limpieza de overlays completada"
}

# 0. Backup de datos importantes (si es necesario)
echo -e "${YELLOW}0️⃣ Creando backup...${NC}"
if [ -f ".env" ]; then
    cp .env "$BACKUP_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)" || true
    log "Backup de .env creado"
fi

# 0.5. Crear directorios de persistencia si no existen
echo -e "${BLUE}📁 Verificando directorios de persistencia...${NC}"
mkdir -p whatsapp-sessions uploads/whatsapp-temp puppeteer-cache
# Establecer permisos más permisivos (777) para evitar problemas EBUSY en producción
# Esto es necesario porque Puppeteer necesita acceso completo al directorio
chmod -R 777 whatsapp-sessions uploads puppeteer-cache 2>/dev/null || true

# Verificar y proteger sesiones existentes
if [ -d "whatsapp-sessions" ] && [ "$(ls -A whatsapp-sessions 2>/dev/null)" ]; then
    session_count=$(find whatsapp-sessions -type f -o -type d | wc -l)
    echo -e "${GREEN}  ✅ Sesiones de WhatsApp encontradas ($session_count archivos/carpetas)${NC}"
    echo "  📂 Las sesiones serán preservadas durante el build"
    log "Sesiones de WhatsApp encontradas y preservadas"
else
    echo -e "${YELLOW}  ℹ️  No hay sesiones previas${NC}"
    log "No hay sesiones previas"
fi

log "Directorios de persistencia verificados"

# 1. Detener contenedores (cualquiera que esté corriendo)
echo -e "${YELLOW}1️⃣ Deteniendo contenedores...${NC}"
log "Iniciando despliegue"
if docker ps -a --filter name=${CONTAINER_NAME} | grep -q ${CONTAINER_NAME}; then
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
    echo "  ✓ Contenedor ${CONTAINER_NAME} detenido"
    log "Contenedor ${CONTAINER_NAME} detenido"
else
    echo "  (No había contenedores corriendo)"
    log "No había contenedores corriendo"
fi

# 1.5. Limpiar overlays bloqueados (antes de intentar eliminar)
cleanup_blocked_overlays

# 2. Esperar que termine limpiamente
echo -e "${YELLOW}2️⃣ Esperando cierre limpio (10 segundos)...${NC}"
sleep 10

# 3. Limpiar espacio en disco (opcional para VPS)
echo -e "${BLUE}🧹 Limpiando imágenes Docker no utilizadas...${NC}"
docker system prune -f || true
log "Limpieza de Docker completada"

# 4. Construir nueva imagen
echo -e "${YELLOW}4️⃣ Construyendo nueva imagen...${NC}"
log "Iniciando build de imagen"
docker compose -f ${COMPOSE_FILE} build --no-cache
if [ $? -eq 0 ]; then
    log "Build completado exitosamente"
else
    log "ERROR en build"
    exit 1
fi

# 5. Eliminar contenedores viejos
echo -e "${YELLOW}5️⃣ Eliminando contenedores viejos...${NC}"
# Intentar eliminar normalmente
if docker rm ${CONTAINER_NAME} 2>/dev/null; then
    echo "  ✓ Contenedor eliminado"
    log "Contenedores viejos eliminados"
else
    # Si falla, intentar forzar limpieza de overlays y eliminar de nuevo
    echo "  ⚠️  Error eliminando contenedor, intentando limpieza forzada..."
    cleanup_blocked_overlays
    sleep 2
    docker rm -f ${CONTAINER_NAME} 2>/dev/null || echo "  (No había contenedores viejos)"
    log "Contenedores viejos eliminados (forzado)"
fi

# 6. Levantar contenedor nuevo
echo -e "${YELLOW}6️⃣ Levantando contenedor nuevo...${NC}"
log "Levantando contenedor nuevo"
docker compose -f ${COMPOSE_FILE} up -d
if [ $? -eq 0 ]; then
    log "Contenedor levantado exitosamente"
else
    log "ERROR levantando contenedor"
    exit 1
fi

# 7. Verificar
echo -e "${YELLOW}7️⃣ Verificando...${NC}"
sleep 5
if docker ps | grep -q ${CONTAINER_NAME}; then
    echo -e "${GREEN}✓ ¡Contenedor corriendo!${NC}"
    docker ps | grep ${CONTAINER_NAME}
    echo ""
    echo -e "${GREEN}📊 Estadísticas del contenedor:${NC}"
    docker stats ${CONTAINER_NAME} --no-stream
else
    echo -e "${RED}❌ Error: El contenedor no está corriendo${NC}"
    echo -e "${YELLOW}📋 Últimos logs:${NC}"
    docker logs ${CONTAINER_NAME} --tail 50
    exit 1
fi

# 8. Verificar salud del servidor
echo ""
echo -e "${YELLOW}8️⃣ Verificando salud del servidor...${NC}"
sleep 5
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/api/health 2>/dev/null | grep -q "200"; then
    echo -e "${GREEN}✓ Servidor respondiendo correctamente${NC}"
    log "Servidor respondiendo correctamente"
else
    echo -e "${YELLOW}⚠ Advertencia: El servidor podría no estar listo aún${NC}"
    echo "   Ejecuta: docker logs ${CONTAINER_NAME} -f"
    log "Servidor aún no está listo"
fi

# 9. Mostrar información del despliegue
echo ""
echo -e "${GREEN}✅ Despliegue completado${NC}"
log "Despliegue completado exitosamente"

# Obtener IP del VPS
VPS_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}🌐 URLs disponibles:${NC}"
echo "   • Local: http://localhost:3005"
echo "   • VPS IP: http://${VPS_IP}:3005"
echo "   • Monitor: http://${VPS_IP}:3005/monitor"
echo "   • Swagger: http://${VPS_IP}:3005/api/multichat/doc"
echo ""
echo -e "${YELLOW}📝 Comandos útiles:${NC}"
echo "   • Ver logs en tiempo real: docker logs ${CONTAINER_NAME} -f"
echo "   • Ver estadísticas: docker stats ${CONTAINER_NAME}"
echo "   • Ver logs del despliegue: cat ${LOG_FILE}"
echo "   • Reiniciar contenedor: docker restart ${CONTAINER_NAME}"
echo "   • Detener contenedor: docker stop ${CONTAINER_NAME}"
echo ""
echo -e "${YELLOW}📊 Recursos actuales:${NC}"
docker stats ${CONTAINER_NAME} --no-stream || true
echo ""

