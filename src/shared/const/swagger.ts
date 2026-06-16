import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';

export const SWAGGER_BEARER_NAME = 'access-token';
export const SWAGGER_PATH = '/api/tickets/doc';
export const SWAGGER_ASSETS_PATH = '/api/tickets/doc/assets';

const SWAGGER_TAGS_ORDER = [
  'Auth',
  'Organizations',
  'Users',
  'Roles',
  'User File',
  'System Parameters'
] as const;

type SwaggerSetupOptions = {
  port?: number;
  baseUrl?: string;
};

export function setupSwagger(app: INestApplication, options: SwaggerSetupOptions = {}) {
  const { port = 3005, baseUrl } = options;

  const configBuilder = new DocumentBuilder()
    .setTitle('Tickets API')
    .setDescription(
      `API REST de la **ticketera** — plataforma para venta, gestión y administración de entradas.

## Autenticación

La mayoría de los endpoints requieren el header \`Authorization: Bearer <jwt>\`.

### Endpoints públicos
- \`POST /auth/login\` — Inicio de sesión
- \`POST /auth/validate-code-login\` — Validación de código 2FA
- \`POST /auth/send-reset-password\` — Solicitar restablecimiento de contraseña
- \`POST /auth/reset-password\` — Restablecer contraseña
- \`POST /auth/register/client\` — Registro de cliente
- \`POST /auth/validate-email\` — Verificación de email
- \`POST /auth/register/resend-email-verification\` — Reenvío de verificación`
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
        name: 'JWT',
        description: 'Token JWT obtenido en /auth/login',
        in: 'header'
      },
      SWAGGER_BEARER_NAME
    );

  configBuilder.addServer(`http://localhost:${port}`, 'Local');

  if (baseUrl) {
    configBuilder.addServer(baseUrl, 'Producción');
  }

  const config = configBuilder.build();
  const document = SwaggerModule.createDocument(app, config);
  (document as { security?: Record<string, unknown>[] }).security = [{ [SWAGGER_BEARER_NAME]: [] }];

  const expressApp = app.getHttpAdapter().getInstance();
  const expressLib = require('express');
  const swaggerUiDistPath = require('swagger-ui-dist').absolutePath();

  expressApp.use(SWAGGER_ASSETS_PATH, expressLib.static(swaggerUiDistPath));
  expressApp.use('/api/multimedia', expressLib.static(join(process.cwd(), 'multimedia')));

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: {
      defaultModelsExpandDepth: -1,
      persistAuthorization: true,
      tagsSorter: (a: string, b: string) => {
        const indexA = SWAGGER_TAGS_ORDER.indexOf(a as (typeof SWAGGER_TAGS_ORDER)[number]);
        const indexB = SWAGGER_TAGS_ORDER.indexOf(b as (typeof SWAGGER_TAGS_ORDER)[number]);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
      },
      operationsSorter: (a: { get: (arg: string) => string }, b: { get: (arg: string) => string }) => {
        const methodsOrder = ['get', 'post', 'put', 'patch', 'delete'];
        return methodsOrder.indexOf(a.get('method')) - methodsOrder.indexOf(b.get('method'));
      }
    },
    customSiteTitle: 'Tickets API — Documentación',
    customCssUrl: 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css',
    customJs: [
      `${SWAGGER_ASSETS_PATH}/swagger-ui-bundle.js`,
      `${SWAGGER_ASSETS_PATH}/swagger-ui-standalone-preset.js`
    ]
  });
}
