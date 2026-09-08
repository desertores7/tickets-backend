import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  SupportRequestStatus,
  SupportRequestType
} from '@config/db/entities/system/support_request.entity';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { OptionalUserAuth } from '@root/shared/auth/decorator/optional-user-auth.decorator';
import { OptionalUser } from '@root/shared/auth/decorator/optional-user.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import {
  ApiFilter,
  FilterParams,
  IFiltersParams
} from '@root/shared/decorators/filter-query.decorator';
import {
  ApiPagination,
  IPaginationParams,
  PaginationParams
} from '@root/shared/decorators/pagination-query.decorator';
import {
  ApiSearch,
  ISearchParams,
  SearchParams
} from '@root/shared/decorators/search-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { ISupportService } from '../services/contracts/isupport.service';
import { supportFilters } from './const/support.filters';
import { SupportContactRequest } from './requests/support-contact.request';
import { UpdateSupportRequestRequest } from './requests/update-support-request.request';
import {
  SupportRequestResponse,
  SupportRequestsResponse
} from './responses/support-request.response';

@Controller('support')
export class SupportController {
  constructor(@Inject('ISupportService') private readonly supportService: ISupportService) {}

  @OptionalUserAuth(SupportContactRequest, null)
  @ApiOperation({
    summary: 'Contactar a soporte',
    description:
      'Sends a support contact form by email (SMTP) and stores it in the support inbox. Public; ' +
      'if the user is logged in, the message is linked to their account. If SMTP is not ' +
      'configured, logs the message and still returns 200.'
  })
  @ApiResponse({ status: 200, description: 'Consulta recibida' })
  @HttpCode(200)
  @ApiTags('Soporte')
  @Post('contact')
  async contact(
    @Body() body: SupportContactRequest,
    @OptionalUser() userId: string | null
  ): Promise<{ message: string }> {
    return this.supportService.contact({
      type: body.type,
      message: body.message,
      email: body.email,
      userUuid: userId ?? undefined
    });
  }

  @AdminAuth(null, SupportRequestsResponse)
  @ApiOperation({
    summary: 'Listar consultas de soporte',
    description:
      'Bandeja de consultas recibidas por el formulario de contacto (`33` §16). El canal de ' +
      'trabajo sigue siendo el email (`BR-SUPPORT-002`); esto es la constancia de qué entró y en ' +
      'qué quedó.\n\n' +
      'Orden fijo: lo sin atender primero y, dentro de eso, lo más nuevo arriba. `nuevas` cuenta ' +
      'sobre el total, no sobre la página. Soporta `search` (email o texto del mensaje) y ' +
      'filtros `status` y `type`.'
  })
  @ApiSearch()
  @ApiFilter(supportFilters)
  @ApiPagination()
  @ApiResponse({ status: 200, type: SupportRequestsResponse })
  @HttpCode(200)
  @ApiTags('Admin — Soporte')
  @Get('requests')
  async listRequests(
    @SearchParams() search: ISearchParams,
    @FilterParams(supportFilters) filters: IFiltersParams<typeof supportFilters>,
    @PaginationParams() pagination: IPaginationParams
  ): Promise<SupportRequestsResponse> {
    const result = await this.supportService.listRequests(
      search,
      {
        status: filters.status?.[0] as SupportRequestStatus | undefined,
        type: filters.type?.[0] as SupportRequestType | undefined
      },
      pagination
    );

    return new SupportRequestsResponse(
      result.items.map(i => new SupportRequestResponse(i)),
      result.nuevas,
      new PaginationMetaResponse({
        total: result.total,
        page: pagination.page,
        limit: pagination.limit
      })
    );
  }

  @AdminAuth(UpdateSupportRequestRequest, SupportRequestResponse)
  @ApiOperation({
    summary: 'Actualizar consulta de soporte',
    description:
      'Cambia el estado y/o las notas internas. El mensaje y quién lo escribió no se tocan: son ' +
      'lo que entró.\n\n' +
      'Pasar a `resolved` guarda quién la cerró y cuándo; reabrirla limpia ese dato, porque si ' +
      'vuelve a estar abierta nadie la cerró.'
  })
  @ApiParam({ name: 'requestUuid', description: 'UUID de la consulta.' })
  @ApiResponse({ status: 200, type: SupportRequestResponse })
  @ApiResponse({ status: 404, description: 'La consulta no existe' })
  @HttpCode(200)
  @ApiTags('Admin — Soporte')
  @Patch('requests/:requestUuid')
  async updateRequest(
    @Param('requestUuid') requestUuid: string,
    @Body() body: UpdateSupportRequestRequest,
    @User() loggedUser: string
  ): Promise<SupportRequestResponse> {
    return new SupportRequestResponse(
      await this.supportService.updateRequest(
        requestUuid,
        { status: body.status, internalNotes: body.internalNotes },
        loggedUser
      )
    );
  }
}
