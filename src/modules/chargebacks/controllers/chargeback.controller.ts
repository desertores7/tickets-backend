import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import {
  ApiPagination,
  IPaginationParams,
  PaginationParams
} from '@root/shared/decorators/pagination-query.decorator';
import { ChargebackService, TChargebackFilters } from '../services/implementation/chargeback.service';
import {
  ChargebackResponse,
  GetChargebacksResponse,
  UpdateChargebackNotesRequest
} from './dtos/chargeback.dto';

/** JPEG, PNG o PDF: es lo único que acepta `documentation` de MP. */
const ALLOWED_EVIDENCE_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_EVIDENCE_TOTAL_BYTES = 10 * 1024 * 1024;

/**
 * Bandeja de contracargos (`BR-SUPPORT-004`). Solo Admin: es plata de la
 * plataforma, no de la productora.
 */
@ApiTags('Admin — Contracargos')
@Controller('admin/chargebacks')
export class ChargebackController {
  constructor(private readonly chargebackService: ChargebackService) {}

  @AdminAuth(null, GetChargebacksResponse)
  @ApiOperation({
    summary: 'Listar contracargos',
    description:
      'Disputes opened by buyers with their bank, as reported by MercadoPago. Open ones first, ' +
      'newest first within that. `openCount` counts every open dispute, not just this page.'
  })
  @ApiPagination()
  @ApiQuery({ name: 'status', required: false, description: 'Estado de Mercado Pago.' })
  @ApiQuery({ name: 'open', required: false, description: '`1` para ver solo los abiertos.' })
  @ApiQuery({ name: 'search', required: false, description: 'Id de contracargo de Mercado Pago.' })
  @HttpCode(200)
  @Get()
  async list(
    @PaginationParams() pagination: IPaginationParams,
    @Query() filters: TChargebackFilters
  ): Promise<GetChargebacksResponse> {
    const [result, openCount] = await Promise.all([
      this.chargebackService.list(filters, pagination),
      this.chargebackService.countOpen()
    ]);
    return new GetChargebacksResponse({ ...result, openCount });
  }

  @AdminAuth(null, ChargebackResponse)
  @ApiOperation({
    summary: 'Obtener contracargo',
    description: 'Full detail of one dispute, with its order, event and buyer when we could link them.'
  })
  @ApiParam({ name: 'uuid' })
  @HttpCode(200)
  @Get(':uuid')
  async getDetail(@Param('uuid', new ParseUUIDPipe()) uuid: string): Promise<ChargebackResponse> {
    return new ChargebackResponse(await this.chargebackService.getDetail(uuid));
  }

  @AdminAuth(null, ChargebackResponse)
  @ApiOperation({
    summary: 'Responder evidencia del contracargo',
    description:
      'Sube evidencia (facturas, capturas, comprobantes) a Mercado Pago ' +
      '(`POST /v1/chargebacks/:id/documentation`). Hasta 10 archivos, 10MB entre todos, ' +
      'JPEG/PNG/PDF. Después de subir, se vuelve a consultar el contracargo en MP para ' +
      'reflejar el nuevo `documentationStatus` (normalmente pasa a `review_pending`).'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
      required: ['files']
    }
  })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Evidencia subida y contracargo actualizado.' })
  @ApiResponse({ status: 400, description: 'Sin archivos, tipo no permitido, o MP rechazó la evidencia.' })
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: MAX_EVIDENCE_TOTAL_BYTES } }))
  @Post(':uuid/documentation')
  async submitEvidence(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @UploadedFiles(new ParseFilePipeBuilder().build({ fileIsRequired: true }))
    files: Express.Multer.File[],
    @User() userId: string
  ): Promise<ChargebackResponse> {
    if (!files.length) throw new BadRequestException('Subí al menos un archivo');

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_EVIDENCE_TOTAL_BYTES) {
      throw new BadRequestException('El total de archivos no puede superar los 10MB');
    }

    const invalid = files.find(file => !ALLOWED_EVIDENCE_MIME_TYPES.includes(file.mimetype));
    if (invalid) {
      throw new BadRequestException(`Tipo de archivo no permitido: ${invalid.mimetype}. Solo JPEG, PNG o PDF`);
    }

    const result = await this.chargebackService.submitEvidence(
      uuid,
      files.map(file => ({ buffer: file.buffer, filename: file.originalname, mimetype: file.mimetype })),
      userId
    );
    return new ChargebackResponse(result);
  }

  @AdminAuth(UpdateChargebackNotesRequest, ChargebackResponse)
  @ApiOperation({
    summary: 'Actualizar notas del contracargo',
    description:
      'Internal notes only. Status, amount and deadline come from MercadoPago and are never edited here.'
  })
  @ApiParam({ name: 'uuid' })
  @HttpCode(200)
  @Patch(':uuid/notes')
  async updateNotes(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Body() body: UpdateChargebackNotesRequest
  ): Promise<ChargebackResponse> {
    return new ChargebackResponse(
      await this.chargebackService.updateNotes(uuid, body.internalNotes ?? null)
    );
  }
}
