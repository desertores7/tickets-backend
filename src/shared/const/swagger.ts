import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';

export const SWAGGER_BEARER_NAME = 'access-token';
export const SWAGGER_PATH = 'api/tickets/doc';
export const SWAGGER_URL = `/${SWAGGER_PATH}`;

type SwaggerSetupOptions = {
  port?: number;
  baseUrl?: string;
};

/** Corrige schemas que Nest genera como `{ type: 'object' }` sin properties y rompen Swagger UI 5. */
function patchOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  const schemas = document.components?.schemas;
  if (!schemas) return document;

  const stringNullableFields = new Set([
    'username',
    'phone',
    'dni',
    'gender',
    'createdBy',
    'updatedBy',
    'description'
  ]);
  const dateNullableFields = new Set(['birthday', 'isDeleted', 'emailVerifiedAt', 'termsAcceptedAt']);

  for (const schema of Object.values(schemas)) {
    if (!schema || typeof schema !== 'object' || !('properties' in schema) || !schema.properties) {
      continue;
    }

    for (const [name, property] of Object.entries(schema.properties)) {
      if (!property || typeof property !== 'object') continue;

      const prop = property as Record<string, unknown>;
      const isBareObject = prop.type === 'object' && !prop.properties && !prop.$ref && !prop.allOf;

      if (!isBareObject) continue;

      if (name === 'imgProfile') {
        prop.properties = {
          url: { type: 'string' },
          type: { type: 'string' }
        };
        delete prop.nullable;
        continue;
      }

      if (name === 'activeUser' || name === 'active') {
        prop.type = 'number';
        continue;
      }

      if (name === 'role' && (prop.allOf || prop.nullable)) {
        prop.nullable = true;
        delete prop.type;
        continue;
      }

      if (dateNullableFields.has(name)) {
        prop.type = 'string';
        prop.format = 'date-time';
        continue;
      }

      if (stringNullableFields.has(name) || prop.nullable) {
        prop.type = 'string';
      }
    }
  }

  return document;
}

/**
 * Ordena los endpoints DENTRO de cada seccion siguiendo la convencion del
 * proyecto: listar -> obtener -> crear -> actualizar -> eliminar -> acciones.
 *
 * Se hace sobre el documento OpenAPI y no reordenando los metodos en los
 * controllers a proposito: en Nest el orden de declaracion resuelve rutas, y
 * mover un `@Get(':uuid')` por encima de un `@Get('users')` hace que 'users'
 * se interprete como un uuid. El orden visual y el orden de routing son dos
 * problemas distintos y se resuelven por separado.
 */
const VERB_RANK: ReadonlyArray<[RegExp, number]> = [
  [/^listar\b/i, 0],
  [/^obtener\b/i, 1],
  // Descargar es una lectura del recurso: va junto a obtener, no al final.
  [/^descargar\b/i, 1],
  [/^buscar\b/i, 2],
  [/^exportar\b/i, 2],
  [/^crear\b/i, 3],
  [/^registrar\b/i, 3],
  // Subir queda pegado al alta: el flujo real es registrar y despues adjuntar.
  [/^subir\b/i, 3],
  [/^actualizar\b/i, 4],
  [/^reemplazar\b/i, 4],
  [/^eliminar\b/i, 5],
  [/^quitar\b/i, 5],
  [/^desasignar\b/i, 5]
];

const ACTION_RANK = 6;

function operationRank(summary: string | undefined): number {
  if (!summary) return ACTION_RANK;
  for (const [re, rank] of VERB_RANK) {
    if (re.test(summary)) return rank;
  }
  return ACTION_RANK;
}

function sortOperations(document: OpenAPIObject): OpenAPIObject {
  if (!document.paths) return document;

  // Orden declarado de los tags: es el que decide el orden de las secciones.
  const tagOrder = new Map((document.tags ?? []).map((t, i) => [t.name, i]));
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

  const entries = Object.entries(document.paths).map(([path, item], position) => {
    let tagRank = Number.MAX_SAFE_INTEGER;
    let verbRank = ACTION_RANK;

    for (const method of methods) {
      const op = (item as Record<string, unknown>)[method] as
        | { tags?: string[]; summary?: string }
        | undefined;
      if (!op) continue;

      const opTagRank = Math.min(
        ...(op.tags?.map(t => tagOrder.get(t) ?? Number.MAX_SAFE_INTEGER) ?? [
          Number.MAX_SAFE_INTEGER
        ])
      );
      const opVerbRank = operationRank(op.summary);

      // El path se ubica por su operacion mas "temprana": una ruta con GET y
      // DELETE se muestra donde corresponde al GET.
      if (opTagRank < tagRank || (opTagRank === tagRank && opVerbRank < verbRank)) {
        tagRank = opTagRank;
        verbRank = opVerbRank;
      }
    }

    return { path, item, tagRank, verbRank, position };
  });

  entries.sort(
    (a, b) =>
      a.tagRank - b.tagRank ||
      a.verbRank - b.verbRank ||
      // Empate: se respeta el orden original, para que el resultado sea estable.
      a.position - b.position
  );

  document.paths = entries.reduce(
    (acc, e) => {
      acc[e.path] = e.item;
      return acc;
    },
    {} as OpenAPIObject['paths']
  );

  return document;
}

export function setupSwagger(app: INestApplication, options: SwaggerSetupOptions = {}) {
  const { port = 3005, baseUrl } = options;

  const configBuilder = new DocumentBuilder()
    .setTitle('Tickets API')
    .setDescription(
      `API REST de la ticketera — plataforma para venta, gestión y administración de entradas.

## Autenticación

La mayoría de los endpoints requieren el header Authorization: Bearer <jwt>.

### Endpoints públicos
- POST /auth/login
- POST /auth/send-reset-password
- POST /auth/reset-password
- POST /auth/register/client
- POST /auth/validate-email
- POST /auth/register/resend-email-verification`
    )
    .setVersion('1.0')
    // El orden de estos addTag es el orden en que Swagger UI muestra las
    // secciones. Agrupado por audiencia: plataforma, comprador, productora,
    // puerta y administración. Un tag = un CRUD o un sub-recurso; si un tag
    // pasa de ~12 endpoints, se parte.

    // ── Plataforma ──────────────────────────────────────────────────────────
    .addTag('Auth', 'Login, registro, verificación de email, 2FA y recupero de contraseña')
    .addTag('Perfil', 'Perfil del usuario autenticado: datos, contraseña y baja de cuenta')
    .addTag('Notificaciones', 'Notificaciones del usuario autenticado')
    .addTag('Soporte', 'Contacto con soporte')

    // ── Público / comprador ─────────────────────────────────────────────────
    .addTag('Público — Eventos', 'Catálogo público: listado, detalle, slug y mapa de sala')
    .addTag('Compra — Órdenes', 'Creación, consulta y cancelación de órdenes de compra')
    .addTag('Compra — Pagos', 'Inicialización de pago, webhook de Mercado Pago y consulta')
    .addTag('Compra — Tickets', 'Tickets del usuario autenticado: listado y detalle')
    .addTag(
      'Compra — Reembolsos',
      'Pedido de reembolso por cambio material del evento (BR-REFUND-001)'
    )

    // ── Productora (backoffice) ─────────────────────────────────────────────
    .addTag('Productora — Organización', 'Datos fiscales, validación y solicitudes de cambio')
    .addTag('Productora — Staff', 'Validadores, personal de caja e invitaciones a productores')
    .addTag('Productora — Eventos', 'CRUD del evento y resumen de comisiones')
    .addTag('Productora — Ciclo de vida', 'Publicar, despublicar, cancelar, cerrar ventas e historial de cambios')
    .addTag('Productora — Tandas', 'Tipos de entrada del evento: alta, edición y baja (individual y bulk)')
    .addTag('Productora — Multimedia', 'Banners por plataforma y galería de imágenes del evento')
    .addTag('Productora — Mapa', 'Mapa de sectores: geometría, imagen base y sugerencias por IA')
    .addTag('Productora — Equipo del evento', 'Productores y validadores asignados a un evento')
    .addTag('Productora — Cupones', 'Cupones de descuento del evento')
    .addTag('Productora — Alertas de stock', 'Avisos por stock bajo y agotado, por tanda')
    .addTag('Productora — Gastos', 'Gastos del evento por categoría')
    .addTag(
      'Productora — Reembolsos',
      'Solicitudes de reembolso de los eventos de la organización (`29` §7)'
    )
    .addTag('Productora — Caja', 'Ingresos manuales, resumen de caja y movimientos de Mercado Pago')
    .addTag('Productora — Mercado Pago', 'Cuentas conectadas por OAuth y catálogo sincronizado')
    .addTag('Productora — Catálogo', 'Ítems manuales y copia del catálogo de Mercado Pago')
    .addTag('Productora — Liquidaciones', 'Liquidaciones recibidas y comprobantes')
    .addTag('Productora — Reportes', 'Ventas, exportación y dashboard del evento')

    // ── Staff en puerta ─────────────────────────────────────────────────────
    .addTag('Acceso — Check-in', 'Validación de QR, búsqueda por documento y contador en vivo')

    // ── Administración ──────────────────────────────────────────────────────
    .addTag('Admin — Organizaciones', 'Alta, listado, aprobación y rechazo de productoras')
    .addTag('Admin — Usuarios', 'Gestión de usuarios y asignación de roles')
    .addTag('Admin — Roles', 'Roles y permisos del sistema')
    .addTag(
      'Admin — Reembolsos',
      'Reintento manual de reembolsos fallidos y extensión del plazo (BR-REFUND-011)'
    )
    .addTag('Admin — Archivos de usuario', 'Archivos e imágenes de perfil de usuario')
    .addTag('Admin — Liquidaciones', 'Registro de liquidaciones y carga de comprobantes')
    .addTag('Admin — Tickets', 'Regeneración de QR y administración de tickets')
    .addTag('Admin — Notificaciones', 'Envío de notificaciones in-app (pruebas / admin)')
    .addTag('Admin — Backoffice', 'Home y dashboard consolidado por rol')
    .addTag('Admin — Parámetros', 'Parámetros de configuración y tokens internos')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT obtenido en /auth/login'
      },
      SWAGGER_BEARER_NAME
    );

  configBuilder.addServer('/', 'Servidor actual');

  configBuilder.addServer(`http://localhost:${port}`, 'Local');

  if (baseUrl) {
    configBuilder.addServer(baseUrl, 'Producción');
  }

  const config = configBuilder.build();
  const document = sortOperations(patchOpenApiDocument(SwaggerModule.createDocument(app, config)));

  const expressApp = app.getHttpAdapter().getInstance();
  const expressLib = require('express');
  expressApp.use('/api/multimedia', expressLib.static(join(process.cwd(), 'multimedia')));

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    useGlobalPrefix: false,
    jsonDocumentUrl: 'api/tickets/doc-json',
    swaggerOptions: {
      defaultModelsExpandDepth: -1,
      persistAuthorization: true
      // Sin tagsSorter ni operationsSorter a proposito: con 'alpha' Swagger UI
      // reordena todo alfabeticamente y descarta el orden de los addTag de
      // arriba. Sin ellos manda el orden declarado (secciones) y el orden de
      // los metodos dentro de cada controller (endpoints).
    },
    customSiteTitle: 'Tickets API - Documentacion'
  });
}
