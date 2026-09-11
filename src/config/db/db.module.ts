import { EnvService } from '@config/env/env.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DBRepository } from './db.repository';
import { entitiesData } from './meta/db.data';
import { DatabaseConnectionManager } from './db.connection';
import { DatabaseKeepaliveService } from './db-keepalive.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [EnvService],
      useFactory: (envService: EnvService) => {
        try {
          console.log('DBModule - Starting database configuration');

          // Obtener configuración base
          const baseConfig = DatabaseConnectionManager.getConnectionConfig();

          // Configuración de base de datos
          // Nunca loguear este objeto: trae la contraseña de la base. Los campos
          // útiles ya salen abajo, en el log de conexión.
          const dbConnectionData = envService.get('DB_CONNECTION_DATA');

          if (!dbConnectionData) {
            throw new Error('DB_CONNECTION_DATA is required');
          }

          const { database, host, port, username, password } = dbConnectionData;

          if (!database || !host || !port || !username || !password) {
            // Solo qué falta, no los valores.
            console.log('DB_CONNECTION_DATA issue', {
              database: Boolean(database),
              host: Boolean(host),
              port: Boolean(port),
              username: Boolean(username),
              password: Boolean(password)
            });
            throw new Error('DB_CONNECTION_DATA issue');
          }

          console.log('Attempting to connect to database:', { host, port, database, username });

          const config = {
            ...baseConfig,
            connectorPackage: 'mysql2' as const,
            username,
            password,
            host,
            port,
            database,
            entities: [...entitiesData.map(e => e.entity)],
            autoLoadEntities: true,
            synchronize: false,
            logging: false
          };

          console.log('Database configuration created successfully');
          return config;
        } catch (error) {
          DatabaseConnectionManager.handleConnectionError(error);
          throw error;
        }
      }
    })
  ],
  providers: [DBRepository, DatabaseKeepaliveService],
  exports: [DBRepository]
})
export class DBModule {}
