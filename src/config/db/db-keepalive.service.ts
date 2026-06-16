import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Ejecuta una consulta ligera (SELECT 1) cada pocos minutos para evitar que MySQL
 * cierre la conexión por inactividad (wait_timeout / interactive_timeout).
 * Sin esto, la primera petición tras un rato sin uso puede fallar con:
 * "The client was disconnected by the server because of inactivity."
 */
@Injectable()
export class DatabaseKeepaliveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseKeepaliveService.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly INTERVAL_MS = 4 * 60 * 1000; // 4 minutos (menor que wait_timeout típico de 600s)

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  onModuleInit() {
    this.intervalId = setInterval(() => this.ping(), DatabaseKeepaliveService.INTERVAL_MS);
    this.logger.log(`Keepalive de base de datos iniciado (cada ${DatabaseKeepaliveService.INTERVAL_MS / 1000}s)`);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.log('Keepalive de base de datos detenido');
    }
  }

  private async ping() {
    try {
      await this.dataSource.query('SELECT 1');
      this.logger.debug('DB keepalive OK');
    } catch (err: any) {
      this.logger.warn(`DB keepalive falló: ${err?.message || String(err)}`);
    }
  }
}
