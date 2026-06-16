#!/bin/sh
set -e

# ============================================
# Configurar caché de Puppeteer/Chromium
# ============================================
# Crear directorio de caché de Puppeteer si no existe
mkdir -p /app/.puppeteer-cache

# Configurar variable de entorno para Puppeteer
export PUPPETEER_CACHE_DIR=/app/.puppeteer-cache
# IMPORTANTE: NO establecer PUPPETEER_SKIP_DOWNLOAD (o eliminarlo si existe)
# Cualquier valor, incluso "false", hace que Puppeteer skipee la descarga
unset PUPPETEER_SKIP_DOWNLOAD

# Crear symlink del caché de Puppeteer por defecto a nuestro directorio persistido
# Puppeteer busca en ~/.cache/puppeteer, así que creamos el symlink si no existe
if [ ! -d "/root/.cache/puppeteer" ] && [ ! -L "/root/.cache/puppeteer" ]; then
    mkdir -p /root/.cache
    ln -sf /app/.puppeteer-cache /root/.cache/puppeteer || true
fi

# Verificar si Chromium ya está en el caché
CHROMIUM_FOUND=false
if [ -d "/app/.puppeteer-cache/chrome" ] || [ -d "/root/.cache/puppeteer/chrome" ]; then
    echo "✅ Chromium encontrado en caché"
    CHROMIUM_FOUND=true
fi

# Si no está, intentar descargarlo ANTES de iniciar la aplicación
if [ "$CHROMIUM_FOUND" = "false" ]; then
    echo "⚠️  Chromium no encontrado, descargando ahora (esto puede tardar ~2 minutos)..."
    
    # Método 1: Buscar en estructura estándar
    if [ -f "/app/node_modules/puppeteer/install.js" ]; then
        echo "📦 Instalando Chromium desde node_modules/puppeteer/install.js"
        # IMPORTANTE: NO establecer PUPPETEER_SKIP_DOWNLOAD (eliminar si existe)
        unset PUPPETEER_SKIP_DOWNLOAD
        PUPPETEER_CACHE_DIR=/app/.puppeteer-cache \
            node /app/node_modules/puppeteer/install.js || true
    # Método 2: Buscar en estructura pnpm
    elif INSTALL_JS=$(find /app/node_modules/.pnpm -name "install.js" -path "*/puppeteer/*" 2>/dev/null | head -1); then
        if [ -n "$INSTALL_JS" ]; then
            echo "📦 Instalando Chromium desde: $INSTALL_JS"
            # IMPORTANTE: NO establecer PUPPETEER_SKIP_DOWNLOAD (eliminar si existe)
            unset PUPPETEER_SKIP_DOWNLOAD
            PUPPETEER_CACHE_DIR=/app/.puppeteer-cache \
                node "$INSTALL_JS" || true
        fi
    # Método 3: Intentar con pnpm
    else
        echo "📦 Intentando instalar Chromium con pnpm..."
        unset PUPPETEER_SKIP_DOWNLOAD
        cd /app && PUPPETEER_CACHE_DIR=/app/.puppeteer-cache \
            pnpm rebuild puppeteer 2>&1 | grep -v "WARN\|ERROR" || true
    fi
    
    # Verificar nuevamente si Chromium se descargó
    if [ -d "/app/.puppeteer-cache/chrome" ] || [ -d "/root/.cache/puppeteer/chrome" ]; then
        echo "✅ Chromium descargado exitosamente"
    else
        echo "⚠️  Chromium no se descargó completamente, puede fallar al iniciar WhatsApp"
    fi
fi

# ============================================
# Configurar directorio de uploads
# ============================================
mkdir -p /app/uploads/whatsapp-temp /app/multimedia/user
chmod -R 755 /app/uploads /app/multimedia 2>/dev/null || true

echo "🚀 Iniciando aplicación..."

# Ejecutar el comando original
exec "$@"

