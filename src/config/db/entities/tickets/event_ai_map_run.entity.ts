import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

const tableName = 'event_ai_map_run' as const;

/** Resultado de una corrida: sirvió, falló al llamar, o falló al validar. */
export type EventAiMapRunStatus = 'ok' | 'failed';

/** Inconsistencia detectada por el verificador determinístico. */
export type EventAiMapRunWarning = {
  code: string;
  groupId: string | null;
  message: string;
};

/**
 * Una corrida de POST /events/ai/from-map.
 *
 * Se escribe siempre, salga bien o mal: el caso que falla es justamente el que
 * después hay que poder mirar. El guardado es best-effort — si esta escritura
 * falla, el análisis igual se devuelve.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventAiMapRunEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  userUuid: string | null;

  /** SHA-256 del archivo subido. Permite reconocer la misma imagen entre corridas. */
  @Column({ type: 'varchar', length: 64 })
  imageHash: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  imageName: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  imageBytes: number | null;

  @Column({ type: 'varchar', length: 120 })
  model: string;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  reasoningEffort: string | null;

  @Column({ type: 'varchar', length: 20 })
  status: EventAiMapRunStatus;

  /** Total del endpoint, incluida la preparación de la imagen y el normalizador. */
  @Column({ type: 'int', nullable: true, default: null })
  latencyMs: number | null;

  /** Sólo la llamada a OpenAI. La diferencia con latencyMs es código propio. */
  @Column({ type: 'int', nullable: true, default: null })
  openaiMs: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  promptTokens: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  completionTokens: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  groupCount: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  labelCount: number | null;

  @Column({ type: 'int', default: 0 })
  warningCount: number;

  /** JSON tal cual lo devolvió el modelo, antes de normalizar. */
  @Column({ type: 'longtext', nullable: true, default: null })
  rawResponse: string | null;

  /** Layout ya normalizado: es lo que recibió el frontend. */
  @Column({ type: 'longtext', nullable: true, default: null })
  normalizedResult: string | null;

  @Column({ type: 'json', nullable: true, default: null })
  warnings: EventAiMapRunWarning[] | null;

  @Column({ type: 'varchar', length: 1000, nullable: true, default: null })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;
}

export const EventAiMapRunEntityData = {
  name: tableName,
  entity: EventAiMapRunEntity
} as const;
