import { Logger } from '@nestjs/common';

export class DatabaseConnectionManager {
  private static readonly logger = new Logger(DatabaseConnectionManager.name);

  static getConnectionConfig() {
    this.logger.log('Using MariaDB configuration');

    return {
      type: 'mysql' as const,
      connectorPackage: 'mysql2' as const,
      extra: {
        connectionLimit: 10,
        reconnect: true,
        keepAliveInitialDelay: 0,
        enableKeepAlive: true,
        acquireTimeout: 60000,
        timeout: 60000
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
