import { Global, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * El grafo de inyección de dependencias arranca entero.
 *
 * **Qué protege.** Nest resuelve las dependencias recién al instanciar la
 * aplicación: `tsc` compila perfecto un servicio que inyecta algo que ningún
 * módulo provee, y el error aparece en el arranque del contenedor, ya en
 * producción. Pasó con `AdminNotifierService`, que estaba registrado en
 * `ServiceModule` pero no en `RefundsModule` —que arma su propio
 * `RefundService`— y tiró abajo la API al desplegar.
 *
 * **Cómo lo hace sin infraestructura.** `compile()` construye todos los
 * proveedores pero **no** corre los hooks `onModuleInit`, que es donde Redis se
 * conecta y donde los módulos registran sus jobs. Lo que sí se conectaría al
 * construirse es TypeORM, así que `DBModule` se reemplaza por un doble que
 * expone las mismas dos cosas que el resto del código inyecta: `DBRepository` y
 * `DataSource`. El test no necesita MySQL ni Redis.
 */
describe('AppModule', () => {
  const ENV_MINIMO = {
    JWT_SECRET: 'test-secret-para-el-grafo-de-dependencias',
    JWT_REFRESH_SECRET: 'test-refresh-secret-para-el-grafo',
    QR_SECRET: 'test-qr-secret-de-al-menos-32-caracteres!!'
  } as const;

  let envPrevio: Record<string, string | undefined>;

  beforeAll(() => {
    envPrevio = {};
    for (const [clave, valor] of Object.entries(ENV_MINIMO)) {
      envPrevio[clave] = process.env[clave];
      process.env[clave] = valor;
    }
  });

  afterAll(() => {
    for (const [clave, valor] of Object.entries(envPrevio)) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
  });

  it('resuelve todas las dependencias de todos los módulos', async () => {
    // Imports diferidos: los módulos leen configuración al evaluarse.
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('./app.module');
    const { DBModule } = await import('./config/db/db.module');
    const { DBRepository } = await import('./config/db/db.repository');

    const dataSourceDoble = {
      isInitialized: true,
      getRepository: () => ({}),
      createQueryBuilder: () => {
        throw new Error('El doble del DataSource no ejecuta consultas');
      },
      query: () => {
        throw new Error('El doble del DataSource no ejecuta consultas');
      },
      createQueryRunner: () => {
        throw new Error('El doble del DataSource no ejecuta consultas');
      }
    } as unknown as DataSource;

    // Global como el original: `TypeOrmCoreModule` publica el `DataSource` para
    // toda la app, y medio proyecto lo inyecta sin importar nada.
    @Global()
    @Module({
      providers: [
        { provide: DataSource, useValue: dataSourceDoble },
        { provide: DBRepository, useValue: {} as unknown as InstanceType<typeof DBRepository> }
      ],
      exports: [DataSource, DBRepository]
    })
    class DBModuleDoble {}

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(DBModule)
      .useModule(DBModuleDoble)
      .compile();

    expect(moduleRef).toBeDefined();

    await moduleRef.close();
  }, 120_000);
});
