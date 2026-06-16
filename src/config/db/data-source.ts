import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { entitiesData } from './meta/db.data';

// Cargar variables de entorno
config();

// Función para obtener la configuración de conexión
function getConnectionConfig(): DataSourceOptions {
  const dbConnectionDataStr = process.env.DB_CONNECTION_DATA;

  if (!dbConnectionDataStr) {
    throw new Error('DB_CONNECTION_DATA is required');
  }

  let dbConnectionData: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };

  try {
    dbConnectionData = JSON.parse(dbConnectionDataStr);
  } catch (e) {
    throw new Error('Invalid DB_CONNECTION_DATA format. Must be a valid JSON string.');
  }

  const { database, host, port, username, password } = dbConnectionData;

  if (!database || !host || !port || !username || !password) {
    throw new Error('DB_CONNECTION_DATA must contain: host, port, username, password, database');
  }

  return {
    type: 'mysql',
    host,
    port,
    username,
    password,
    database,
    connectorPackage: 'mysql2',
    entities: entitiesData.map(e => e.entity),
    migrations: process.env.NODE_ENV === 'production' ? ['dist/migrations/*.js'] : ['src/migrations/*.ts'],
    migrationsTableName: 'migrations',
    synchronize: false,
    logging: false
  };
}

// Crear y exportar el DataSource
export const AppDataSource = new DataSource(getConnectionConfig());
