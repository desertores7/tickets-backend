import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MapAnalysisJobStatus } from '@modules/event/services/implementation/map-analysis-job.store';
import { AnalyzeFromMapResponse } from './analyze-from-map.response';

const JOB_STATUS_ENUM: MapAnalysisJobStatus[] = ['processing', 'done', 'failed'];

/** Acuse del encolado: el análisis arranca y el trabajo sigue por atrás. */
export class MapAnalysisQueuedResponse {
  @ApiProperty({
    example: '7f3c1e64-2b19-4d9e-9c11-0a5b6d2f8e31',
    description: 'Id para consultar el estado en GET /events/ai/from-map/{jobId}'
  })
  jobId: string;

  @ApiProperty({ enum: JOB_STATUS_ENUM, example: 'processing' })
  status: MapAnalysisJobStatus;

  @ApiProperty({
    example: false,
    description:
      'true cuando el usuario ya tenía un análisis en curso y se devuelve ese ' +
      'mismo en lugar de encolar otro.'
  })
  alreadyRunning: boolean;

  constructor(data: {
    jobId: string;
    status: MapAnalysisJobStatus;
    alreadyRunning: boolean;
  }) {
    this.jobId = data.jobId;
    this.status = data.status;
    this.alreadyRunning = data.alreadyRunning;
  }
}

/** Estado del análisis. Con `done` viene el mapa listo para dibujar. */
export class MapAnalysisStatusResponse {
  @ApiProperty({ enum: JOB_STATUS_ENUM })
  status: MapAnalysisJobStatus;

  @ApiProperty({ example: '2026-09-12T04:11:02.000Z' })
  startedAt: string;

  @ApiPropertyOptional({
    type: AnalyzeFromMapResponse,
    nullable: true,
    description: 'El mapa analizado. Presente solo con status "done".'
  })
  result: AnalyzeFromMapResponse | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Motivo del fallo, listo para mostrar. Solo con status "failed".'
  })
  error: string | null;

  constructor(data: {
    status: MapAnalysisJobStatus;
    startedAt: string;
    result: AnalyzeFromMapResponse | null;
    error: string | null;
  }) {
    this.status = data.status;
    this.startedAt = data.startedAt;
    this.result = data.result;
    this.error = data.error;
  }
}
