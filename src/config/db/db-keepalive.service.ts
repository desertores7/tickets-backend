import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Mantiene VIVAS Y ABIERTAS las conexiones del pool.
 *
 * El motivo original era no perder la conexión por inactividad (wait_timeout /
 * interactive_timeout): la primera petición tras un rato fallaba con "The
 * client was disconnected by the server because of inactivity".
 *
 * Pero un solo `SELECT 1` toca UNA conexión del pool y deja las otras nueve
 * cerrarse. Un endpoint que dispara varias consultas —guardar el mapa son una
 * decena— las encuentra todas frías y abre una conexión nueva por cada una, en
 * paralelo. Con MySQL fuera del contenedor eso cuesta mucho más que las
 * consultas en sí, y se nota como un primer guardado de decenas de segundos
 * seguido de otro idéntico que tarda un segundo.
 *
 * Por eso el ping va en paralelo, uno por slot del pool: mientras corren todos
 * a la vez ninguno puede reutilizar la conexión del otro, así que el pool
 * termina con todas las conexiones abiertas y calientes.
 */
@Injectable()
export class DatabaseKeepaliveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseKeepaliveService.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly INTERVAL_MS = 4 * 60 * 1000; // 4 minutos (menor que wait_timeout típico de 600s)

  /**
   * Tiene que coincidir con `connectionLimit` de DatabaseConnectionManager.
   * De más no rompe: los pings que sobran esperan un slot libre y salen.
   */
  private static readonly POOL_SIZE = 10;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  onModuleInit() {
    this.intervalId = setInterval(() => this.ping(), DatabaseKeepaliveService.INTERVAL_MS);
    // Un ping de arranque: sin esto, la primera petición real que reciba la API
    // paga la apertura de todo el pool.
    void this.ping();
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
      // En paralelo a propósito: ver el comentario de la clase. Secuencial
      // tocaría siempre la misma conexión y dejaría el resto del pool frío.
      await Promise.all(
        Array.from({ length: DatabaseKeepaliveService.POOL_SIZE }, () =>
          this.dataSource.query('SELECT 1')
        )
      );
      this.logger.debug('DB keepalive OK');
    } catch (err: any) {
      this.logger.warn(`DB keepalive falló: ${err?.message || String(err)}`);
    }
  }
}
