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
  const dateNullableFields = new Set(['birthday', 'isDeleted', 'emailVerifiedAt']);

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
- POST /auth/validate-code-login
- POST /auth/send-reset-password
- POST /auth/reset-password
- POST /auth/register/client
- POST /auth/validate-email
- POST /auth/register/resend-email-verification`
    )
    .setVersion('1.0')
    .addTag('Auth', 'Autenticación, registro y sesiones de usuario')
    .addTag('Organizations', 'Organizaciones y asignación de usuarios')
    .addTag('Users', 'Gestión de usuarios y roles')
    .addTag('Roles', 'Roles y permisos del sistema')
    .addTag('User File', 'Archivos e imágenes de perfil de usuario')
    .addTag('System Parameters', 'Parámetros de configuración del sistema')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT obtenido en /auth/login'
      },
      SWAGGER_BEARER_NAME
    );

  configBuilder.addServer(`http://localhost:${port}`, 'Local');

  if (baseUrl) {
    configBuilder.addServer(baseUrl, 'Producción');
  }

  const config = configBuilder.build();
  const document = patchOpenApiDocument(SwaggerModule.createDocument(app, config));

  const expressApp = app.getHttpAdapter().getInstance();
  const expressLib = require('express');
  expressApp.use('/api/multimedia', expressLib.static(join(process.cwd(), 'multimedia')));

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    useGlobalPrefix: false,
    jsonDocumentUrl: 'api/tickets/doc-json',
    swaggerOptions: {
      defaultModelsExpandDepth: -1,
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha'
    },
    customSiteTitle: 'Tickets API - Documentacion'
  });
}
