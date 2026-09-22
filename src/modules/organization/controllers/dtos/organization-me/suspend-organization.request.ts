import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * El body queda vacio a proposito: la suspension ya no pide un motivo
 * escrito por el admin. El mensaje que ve el productor (modal + email) es
 * siempre el mismo, "infringio las normas de Showpass" (BR-PROD-006), asi
 * que no hay nada que el admin necesite completar antes de suspender.
 */
export class SuspendOrganizationRequest {
  @ApiPropertyOptional({ description: 'Sin uso; se mantiene por compatibilidad con clientes viejos.' })
  reason?: string;
}
