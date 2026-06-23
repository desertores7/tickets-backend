# ── Build ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

# Compila NestJS y copia migraciones + templates de email al dist
RUN pnpm run build

# ── Production dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS prod-deps

RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# ── Production ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

RUN apk add --no-cache openssl ca-certificates tzdata

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8012
ENV TZ=America/Argentina/Buenos_Aires

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Certificados ARCA y archivos subidos se montan en runtime (--env-file + volúmenes)
RUN mkdir -p certs uploads \
    && chown -R node:node /app

USER node

EXPOSE 8012

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const p=process.env.PORT||8012;require('http').get('http://127.0.0.1:'+p+'/api/health',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
