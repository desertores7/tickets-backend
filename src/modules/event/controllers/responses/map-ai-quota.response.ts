import { ApiProperty } from '@nestjs/swagger';

/**
 * Estado de la cuota diaria (24hs rolling) de generaciones de mapa con IA
 * para un evento puntual. `resetAt` es `null` cuando todavía no se consumió
 * nada en la ventana actual (no hay nada por resetear) o cuando la cuota
 * está deshabilitada (`max: 0`).
 */
export class MapAiQuotaResponse {
  @ApiProperty({ example: 2, description: 'Generaciones usadas en la ventana de 24hs actual.' })
  used: number;

  @ApiProperty({ example: 3, description: 'Máximo de generaciones por evento cada 24hs. `0` = sin límite.' })
  max: number;

  @ApiProperty({ example: 1, description: 'Generaciones disponibles antes de bloquear.' })
  remaining: number;

  @ApiProperty({
    example: '2026-09-23T14:05:00.000Z',
    nullable: true,
    description: 'Momento en que se reinicia la cuota (24hs después del primer uso de la ventana actual). `null` si no aplica.'
  })
  resetAt: string | null;

  constructor(data: { used: number; max: number; remaining: number; resetAt: string | null }) {
    this.used = data.used;
    this.max = data.max;
    this.remaining = data.remaining;
    this.resetAt = data.resetAt;
  }
}
