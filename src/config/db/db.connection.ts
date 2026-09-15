import { Logger } from '@nestjs/common';

export class DatabaseConnectionManager {
  private static readonly logger = new Logger(DatabaseConnectionManager.name);

  static getConnectionConfig() {
    this.logger.log('Using MariaDB configuration');

    return {
      type: 'mysql' as const,
      connectorPackage: 'mysql2' as const,
      // Todo en UTC, igual que el servidor MySQL. Tiene que coincidir con
      // `data-source.ts`: si el runtime y las migraciones leen con zonas
      // distintas, la mitad de las fechas sale corrida. Ver la migración
      // NormalizeTimestampsToUtc.
      timezone: 'Z',
      extra: {
        // Las columnas `date` no tienen hora: convertirlas a Date les aplica
        // una zona y les corre el día. Como string viajan intactas.
        dateStrings: ['DATE'],
        connectionLimit: 10,
        /**
         * Que el pool NO cierre las conexiones ociosas.
         *
         * Por defecto mysql2 cierra toda conexión que pasa `idleTimeout` (60 s)
         * sin usarse, y entonces cada pico de tráfico vuelve a abrirlas. Con
         * MySQL fuera del contenedor, abrir una conexión cuesta más que la
         * consulta que va a correr por ella: un endpoint de diez consultas
         * pagaba diez aperturas en paralelo y tardaba decenas de segundos,
         * mientras que el mismo pedido repetido enseguida —ya con el pool
         * caliente— tardaba un segundo.
         *
         * `maxIdle` igual a `connectionLimit` deja el pool entero ocioso pero
         * abierto. El `idleTimeout` de 10 minutos no se alcanza nunca porque el
         * keepalive toca las conexiones cada 4; se deja explícito y no en 0
         * porque mysql2 trata el 0 como "sin límite" en unas versiones y como
         * "cerrar ya" en otras.
         */
        maxIdle: 10,
        idleTimeout: 600000,
        reconnect: true,
        keepAliveInitialDelay: 0,
        enableKeepAlive: true,
        acquireTimeout: 60000,
        connectTimeout: 60000
      }
    };
  }

  static handleConnectionError(error: any) {
    this.logger.error('Database connection error:', error);

    if (error.code === 'ECONNREFUSED') {
      this.logger.error('Database connection refused. Check if the database server is running.');
    } else if (error.code === 'ENOTFOUND') {
      this.logger.error('Database host not found. Check the host configuration.');
    } else if (error.code === 'ETIMEDOUT') {
      this.logger.error('Database connection timeout. Check network connectivity.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      this.logger.error('Database authentication failed. Check username and password.');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      this.logger.error('Database does not exist. Check the database name.');
    } else if (error.code === 'ER_CONNECTION_KILLED') {
      this.logger.error('Database connection was killed. Check server status.');
    } else if (error.code === 'ER_TOO_MANY_CONNECTIONS') {
      this.logger.error('Too many connections to database. Check connection limits.');
    }

    throw error;
  }
}
