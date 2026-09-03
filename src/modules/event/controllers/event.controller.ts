import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { OptionalUserAuth } from '@root/shared/auth/decorator/optional-user-auth.decorator';
import { OptionalUser } from '@root/shared/auth/decorator/optional-user.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { UserRole } from '@root/shared/auth/decorator/user-role.decorator';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { ApiFilter, FilterParams, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IEventService, TEventProducer, TEventValidator, TUpsertEventMap, TUserSummary } from '../services/contracts/ievent.service';
import { EVENT_ORDER_COLUMNS, eventFilters } from './const/event.filters';
import { ApiOrder, IOrderParams, OrderParams } from '@root/shared/decorators/order-query.decorator';
import {
  BANNER_VARIANT_NAMES,
  BannerImages,
  BannerVariant,
  isBannerVariant
} from './const/banner-variant.const';
import { CreateEventRequest } from './requests/create-event.request';
import { UpdateEventRequest } from './requests/update-event.request';
import { CancelEventRequest } from './requests/cancel-event.request';
import { SetSalesClosedRequest } from './requests/event-operation.request';
import { CreateTicketTypeRequest } from './requests/create-ticket-type.request';
import { UpdateTicketTypeRequest } from './requests/update-ticket-type.request';
import {
  BulkCreateTicketTypesRequest,
  BulkDeleteTicketTypesRequest,
  BulkUpdateTicketTypesRequest
} from './requests/bulk-ticket-types.request';
import { AssignProducerRequest } from './requests/assign-producer.request';
import { AssignValidatorRequest } from './requests/assign-validator.request';
import { CreateExpenseRequest, UpdateExpenseRequest } from './requests/upsert-expense.request';
import { EXPENSE_CATEGORIES } from './const/expense-category.const';
import {
  EventExpenseResponse,
  EventExpensesResponse,
  ExpenseCategoryTotalResponse
} from './responses/event-expense.response';
import { GetAllEventResponse } from './responses/get-all-event.response';
import { GetIdEventResponse } from './responses/get-id-event.response';
import {
  EventChangeResponse,
  EventChangesResponse,
  EventSalesStateResponse
} from './responses/event-change.response';
import { TicketTypeResponse } from './responses/ticket-type.response';
import { GetFeeSummaryResponse } from './dtos/get-fee-summary/get-fee-summary.response';
import { EventMediaResponse } from './responses/event-media.response';
import { AnalyzeFlyersResponse } from './responses/analyze-flyers.response';
import { AnalyzeFromMapResponse } from './responses/analyze-from-map.response';
import { EventMapResponse, EventMapSectorResponse } from './responses/event-map.response';
import { SuggestMapSectorsResponse } from './responses/suggest-map-sectors.response';
import {
  SetMapBaseFromMediaRequest,
  UpsertEventMapRequest
} from './requests/upsert-event-map.request';
import { IEventAiService } from '../services/contracts/ievent-ai.service';

@ApiTags('Events')
@Controller('events')
export class EventController {
  constructor(
    @Inject('IEventService') private readonly _eventService: IEventService,
    @Inject('IEventAiService') private readonly _eventAiService: IEventAiService
  ) {}

  @UserAuth(CreateEventRequest, null)
  @ApiOperation({ summary: 'Create event', description: 'Creates a new event for an organization. Requester must be a member of the organization.' })
  @HttpCode(201)
  @Post()
  async createEvent(
    @Body() data: CreateEventRequest,
    @User() loggedUser: string
  ): Promise<{ uuid: string }> {
    return this._eventService.createEvent(data, loggedUser);
  }

  @UserAuth(null, AnalyzeFlyersResponse, 'multipart/form-data')
  @ApiOperation({
    summary: 'Analyze flyer with AI (OpenAI)',
    description:
      'Accepts 1 flyer image (multipart field `flyers` — flyer principal only), extracts event fields via OpenAI vision, ' +
      'and generates one 16:9 ShowPass-style hero background via images.edit ' +
      '(flyer + prompt → gpt-image-2 by default, size/quality/format from env). Requires OPENIA_API_KEY.\n\n' +
      'Cost guards: extract + hero calls per request, per-user hourly Redis quota, ' +
      '8MB/file. Hero timeout 5 min; if hero fails, extraction is still returned.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        flyers: {
          type: 'string',
          format: 'binary',
          description: 'Flyer principal (única imagen usada para extracción + banner)'
        }
      },
      required: ['flyers']
    }
  })
  @ApiResponse({ status: 200, type: AnalyzeFlyersResponse })
  @ApiResponse({ status: 400, description: 'Missing/invalid files.' })
  @ApiResponse({ status: 429, description: 'Hourly AI quota exceeded.' })
  @ApiResponse({ status: 503, description: 'OPENIA_API_KEY missing or OpenAI error.' })
  @UseInterceptors(
    FilesInterceptor('flyers', 1, {
      limits: { fileSize: 8 * 1024 * 1024 }
    })
  )
  @HttpCode(200)
  @Post('ai/from-flyers')
  async analyzeFromFlyers(
    @UploadedFiles() files: Express.Multer.File[],
    @User() loggedUser: string
  ): Promise<AnalyzeFlyersResponse> {
    const result = await this._eventAiService.analyzeFromFlyers(files ?? [], loggedUser);
    return new AnalyzeFlyersResponse(result);
  }

  @UserAuth(null, AnalyzeFromMapResponse, 'multipart/form-data')
  @ApiOperation({
    summary: 'Analyze sales map from image (OpenAI vision)',
    description:
      'Accepts 1 sales map image (multipart field `mapImage`). Returns an abstract venue layout: ' +
      'stage (semantic position), commercial categories, and structural groups (column/row/grid/zone) ' +
      'with every visible label. No per-element x/y geometry — the frontend renders SVG. ' +
      'Uses EVENT_AI_MAP_MODEL exclusively (never EVENT_AI_EXTRACT_MODEL) with optional ' +
      'EVENT_AI_MAP_REASONING_EFFORT for GPT-5 family. Requires OPENIA_API_KEY. Max 8MB. Counts toward hourly AI quota.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        mapImage: {
          type: 'string',
          format: 'binary',
          description: 'Mapa de ventas / plano con precios'
        }
      },
      required: ['mapImage']
    }
  })
  @ApiResponse({ status: 200, type: AnalyzeFromMapResponse })
  @ApiResponse({ status: 400, description: 'Missing/invalid file.' })
  @ApiResponse({ status: 429, description: 'Hourly AI quota exceeded.' })
  @ApiResponse({ status: 503, description: 'OPENIA_API_KEY missing or OpenAI error.' })
  @UseInterceptors(
    FileInterceptor('mapImage', {
      limits: { fileSize: 8 * 1024 * 1024 }
    })
  )
  @HttpCode(200)
  @Post('ai/from-map')
  async analyzeFromMap(
    @UploadedFile() file: Express.Multer.File,
    @User() loggedUser: string
  ): Promise<AnalyzeFromMapResponse> {
    const result = await this._eventAiService.analyzeFromMapImage(file, loggedUser);
    return new AnalyzeFromMapResponse(result);
  }

  @OptionalUserAuth(null, GetAllEventResponse)
  @ApiOperation({
    summary: 'List events',
    description:
      'Public by default: returns published, active events that have not ended yet. No token required.\n\n' +
      'With `mine=true` (requires token) switches to backoffice scope: includes drafts and past events. ' +
      'An `Administrador` gets every event; any other role only gets events belonging to the ' +
      'organizations the user is a member of (e.g. `Productor`).'
  })
  @ApiQuery({
    name: 'mine',
    required: false,
    type: Boolean,
    description: 'Backoffice scope: eventos propios (incluye borradores y pasados).'
  })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(eventFilters)
  @HttpCode(200)
  @ApiOrder(EVENT_ORDER_COLUMNS)
  @Get()
  async getEvents(
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(eventFilters) filters: IFiltersParams<typeof eventFilters>,
    @OrderParams() order: IOrderParams<typeof EVENT_ORDER_COLUMNS>,
    @UserRole() role: string | null,
    @OptionalUser() loggedUser: string | null,
    @Query('mine') mine?: string
  ): Promise<{ meta: PaginationMetaResponse; items: GetAllEventResponse[] }> {
    // `mine` solo aplica con sesión; sin token cae siempre a la vista pública
    const isMine = mine === 'true' && !!loggedUser;
    const result = await this._eventService.getEvents(pagination, search, filters, role, {
      mine: isMine,
      loggedUser,
      order
    });
    return {
      meta: result.meta,
      items: result.items.map(item => new GetAllEventResponse(item))
    };
  }

  @OptionalUserAuth(null, GetIdEventResponse)
  @ApiOperation({
    summary: 'Get event by slug',
    description:
      'Returns event details including ticket types, resolved by public slug. ' +
      'Unpublished drafts are only visible to authenticated users.'
  })
  @ApiParam({ name: 'slug', description: 'Event URL slug' })
  @HttpCode(200)
  @Get('by-slug/:slug')
  async getEventBySlug(
    @Param('slug') slug: string,
    @UserRole() role: string | null
  ): Promise<GetIdEventResponse> {
    const event = await this._eventService.getEventBySlug(slug, role);
    return new GetIdEventResponse(event);
  }

  @OptionalUserAuth(null, GetIdEventResponse)
  @ApiOperation({
    summary: 'Get event by ID',
    description:
      'Returns event details including ticket types. Public: no token required. ' +
      'Unpublished drafts are only visible to authenticated users.'
  })
  @HttpCode(200)
  @Get(':eventUuid')
  async getEventById(
    @Param('eventUuid') eventUuid: string,
    @UserRole() role: string | null
  ): Promise<GetIdEventResponse> {
    const event = await this._eventService.getEventById(eventUuid, role);
    return new GetIdEventResponse(event);
  }

  @UserAuth(null, GetFeeSummaryResponse)
  @ApiOperation({
    summary: 'Get event fee summary',
    description:
      'Returns the accumulated fee summary for an event. ' +
      '**BR-REPORT-001**: `serviceFeeAmount` and `grossAmount` are returned ONLY to an `Administrador`. ' +
      'A producer never sees the service fee — the payload omits those fields entirely. ' +
      'Only the organizer that owns the event or an admin can access it. ' +
      'If the event has no paid sales yet, all numeric fields are returned as 0 (not 404).'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, type: GetFeeSummaryResponse, description: 'Fee summary for the event (zeros if no paid sales yet).' })
  @ApiResponse({ status: 400, description: 'Event not found or inactive.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 403, description: 'User is not a member of the owning organization nor an admin.' })
  @HttpCode(200)
  @Get(':eventUuid/fee-summary')
  async getFeeSummary(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string,
    @UserRole() role: string | null
  ): Promise<GetFeeSummaryResponse> {
    const summary = await this._eventService.getFeeSummary(eventUuid, loggedUser);
    return new GetFeeSummaryResponse(summary, { includeServiceFee: role === 'Administrador' });
  }

  @UserAuth(UpdateEventRequest, null)
  @ApiOperation({ summary: 'Update event', description: 'Updates an event. Only members of the owning organization can update.' })
  @HttpCode(200)
  @Patch(':eventUuid')
  async updateEvent(
    @Param('eventUuid') eventUuid: string,
    @Body() data: UpdateEventRequest,
    @User() loggedUser: string
  ): Promise<void> {
    return this._eventService.updateEvent(eventUuid, data, loggedUser);
  }

  @UserAuth(null, null)
  @ApiOperation({ summary: 'Delete event (soft)', description: 'Soft-deletes an event by setting isActive to false. Only members of the owning organization can delete.' })
  @HttpCode(200)
  @Delete(':eventUuid')
  async deleteEvent(@Param('eventUuid') eventUuid: string, @User() loggedUser: string): Promise<boolean> {
    return this._eventService.deleteEvent(eventUuid, loggedUser);
  }

  @UserAuth(null, null)
  @ApiOperation({ summary: 'Publish event', description: 'Publishes an event making it visible to the public. Requires at least one active ticket type.' })
  @HttpCode(200)
  @Post(':eventUuid/publish')
  async publishEvent(@Param('eventUuid') eventUuid: string, @User() loggedUser: string): Promise<boolean> {
    return this._eventService.publishEvent(eventUuid, loggedUser);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Unpublish event (draft)',
    description:
      'Sets the event back to draft (hidden from public catalog). ' +
      'Not allowed if any ticket type already has confirmed sales (quantity > availableQuantity).'
  })
  @ApiResponse({ status: 200, description: 'Event unpublished' })
  @ApiResponse({ status: 400, description: 'Already draft, or event has confirmed sales' })
  @HttpCode(200)
  @Post(':eventUuid/unpublish')
  async unpublishEvent(@Param('eventUuid') eventUuid: string, @User() loggedUser: string): Promise<boolean> {
    return this._eventService.unpublishEvent(eventUuid, loggedUser);
  }

  @UserAuth(null, EventChangesResponse)
  @ApiOperation({
    summary: 'List event changes',
    description:
      'Historial de cambios del evento (FP10 / `29` §17): cancelaciones, materiales, stock, cierre de venta. ' +
      'Orden: más nuevo → más viejo. Solo productor dueño (404 si no es suyo).'
  })
  @ApiResponse({ status: 200, type: EventChangesResponse })
  @ApiResponse({ status: 404, description: 'Evento no encontrado o sin acceso' })
  @HttpCode(200)
  @Get(':eventUuid/changes')
  async listEventChanges(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<EventChangesResponse> {
    const result = await this._eventService.listEventChanges(eventUuid, loggedUser);
    return new EventChangesResponse(result);
  }

  @UserAuth(CancelEventRequest, EventChangeResponse)
  @ApiOperation({
    summary: 'Cancel event',
    description:
      'Cancela el evento (BR-EVENT-010): marca cancelledAt, corta la venta, persiste event_change. ' +
      'Con ventas → email + ventana 72 h. No borra ni despublica. Idempotente → 409 si ya cancelado.'
  })
  @ApiResponse({ status: 200, type: EventChangeResponse })
  @ApiResponse({ status: 409, description: 'El evento ya está cancelado' })
  @HttpCode(200)
  @Post(':eventUuid/cancel')
  async cancelEvent(
    @Param('eventUuid') eventUuid: string,
    @Body() body: CancelEventRequest,
    @User() loggedUser: string
  ): Promise<EventChangeResponse> {
    const change = await this._eventService.cancelEvent(eventUuid, loggedUser, body?.reason);
    return new EventChangeResponse(change);
  }

  @UserAuth(SetSalesClosedRequest, EventSalesStateResponse)
  @ApiOperation({
    summary: 'Close or reopen sales',
    description:
      'Manual sales cut-off (`BR-EVENT-013`). Not a material change. Productor dueño o Admin. ' +
      'A cancelled event cannot be reopened. Kept apart from `saleEndDate`.'
  })
  @ApiResponse({ status: 200, type: EventSalesStateResponse })
  @ApiResponse({ status: 400, description: 'No se puede reabrir un evento cancelado' })
  @HttpCode(200)
  @Post(':eventUuid/sales-closed')
  async setSalesClosed(
    @Param('eventUuid') eventUuid: string,
    @Body() data: SetSalesClosedRequest,
    @User() loggedUser: string
  ): Promise<EventSalesStateResponse> {
    return new EventSalesStateResponse(
      await this._eventService.setSalesClosed(eventUuid, data.closed, loggedUser)
    );
  }

  @OptionalUserAuth(null, EventMapResponse)
  @ApiOperation({
    summary: 'Get event map (public read)',
    description:
      'Read-only seating/sector map. Published events are public; drafts require ownership.'
  })
  @HttpCode(200)
  @Get(':eventUuid/map/public')
  async getEventMapPublic(
    @Param('eventUuid') eventUuid: string,
    @OptionalUser() loggedUser: string | null,
    @UserRole() role: string | null
  ): Promise<EventMapResponse | null> {
    const map = await this._eventService.getEventMapPublic(eventUuid, {
      loggedUser,
      role
    });
    if (!map) return null;
    return new EventMapResponse({
      ...map,
      sectors: map.sectors.map(s => new EventMapSectorResponse(s))
    });
  }

  @UserAuth(null, EventMapResponse)
  @ApiOperation({ summary: 'Get event map', description: 'Returns the seating/sector map for the event, or null if not created yet.' })
  @HttpCode(200)
  @Get(':eventUuid/map')
  async getEventMap(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<EventMapResponse | null> {
    const map = await this._eventService.getEventMap(eventUuid, loggedUser);
    if (!map) return null;
    return new EventMapResponse({
      ...map,
      sectors: map.sectors.map(s => new EventMapSectorResponse(s))
    });
  }

  @UserAuth(UpsertEventMapRequest, EventMapResponse)
  @ApiOperation({
    summary: 'Create or replace event map sectors',
    description: 'Upserts map metadata and replaces the full sector list (GA sectors linked to ticket types).'
  })
  @HttpCode(200)
  @Put(':eventUuid/map')
  async upsertEventMap(
    @Param('eventUuid') eventUuid: string,
    @Body() body: UpsertEventMapRequest,
    @User() loggedUser: string
  ): Promise<EventMapResponse> {
    const map = await this._eventService.upsertEventMap(
      eventUuid,
      body as unknown as TUpsertEventMap,
      loggedUser
    );
    return new EventMapResponse({
      ...map,
      sectors: map.sectors.map(s => new EventMapSectorResponse(s))
    });
  }

  @UserAuth(null, EventMapResponse)
  @ApiOperation({ summary: 'Upload map base image', description: 'Multipart field `baseImage`. Max 8MB.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { baseImage: { type: 'string', format: 'binary' } },
      required: ['baseImage']
    }
  })
  @UseInterceptors(FileInterceptor('baseImage'))
  @HttpCode(200)
  @Post(':eventUuid/map/base-image')
  async uploadMapBaseImage(
    @Param('eventUuid') eventUuid: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 8 * 1024 * 1024 })
        .build({ fileIsRequired: true })
    )
    file: Express.Multer.File,
    @User() loggedUser: string
  ): Promise<EventMapResponse> {
    const map = await this._eventService.uploadMapBaseImage(eventUuid, file, loggedUser);
    return new EventMapResponse({
      ...map,
      sectors: map.sectors.map(s => new EventMapSectorResponse(s))
    });
  }

  @UserAuth(null, EventMapResponse)
  @ApiOperation({
    summary: 'Delete map base image',
    description: 'Removes the uploaded floor plan. Sectors already drawn are kept.'
  })
  @HttpCode(200)
  @Delete(':eventUuid/map/base-image')
  async deleteMapBaseImage(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<EventMapResponse | null> {
    const map = await this._eventService.removeMapBaseImage(eventUuid, loggedUser);
    if (!map) return null;
    return new EventMapResponse({
      ...map,
      sectors: map.sectors.map(s => new EventMapSectorResponse(s))
    });
  }

  @UserAuth(SetMapBaseFromMediaRequest, EventMapResponse)
  @ApiOperation({
    summary: 'Use gallery image as map base',
    description: 'Sets baseImageUrl from an existing event gallery image (e.g. flyer de precios).'
  })
  @HttpCode(200)
  @Post(':eventUuid/map/base-from-media')
  async setMapBaseFromMedia(
    @Param('eventUuid') eventUuid: string,
    @Body() body: SetMapBaseFromMediaRequest,
    @User() loggedUser: string
  ): Promise<EventMapResponse> {
    const map = await this._eventService.setMapBaseFromMedia(eventUuid, body.mediaUuid, loggedUser);
    return new EventMapResponse({
      ...map,
      sectors: map.sectors.map(s => new EventMapSectorResponse(s))
    });
  }

  @UserAuth(null, SuggestMapSectorsResponse)
  @ApiOperation({
    summary: 'Suggest map sectors (soft-fail)',
    description:
      'Proposes sector rectangles from ticket types (+ optional flyer). Always returns a usable list; warning if AI failed.'
  })
  @HttpCode(200)
  @Post(':eventUuid/map/suggest-sectors')
  async suggestMapSectors(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<SuggestMapSectorsResponse> {
    const ticketTypes = await this._eventService.getTicketTypes(eventUuid);
    // ownership check via getEventMap path
    await this._eventService.getEventMap(eventUuid, loggedUser);
    const media = await this._eventService.getEventMedia(eventUuid, loggedUser);
    const priceFlyer = media.find(m => m.kind === 'image');
    const result = await this._eventAiService.suggestMapSectors({
      ticketTypes: ticketTypes.map(t => ({ uuid: t.uuid, name: t.name })),
      flyerUrl: priceFlyer?.url ?? null
    });
    return new SuggestMapSectorsResponse(result.sectors, result.warning);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Upload event banner (per platform)',
    description:
      'Uploads one banner image per platform variant (multipart/form-data, field `banner`).\n\n' +
      '**Variants:** `desktop` (hero), `mobile`, `thumbnail`.\n\n' +
      'The file is stored **as uploaded** (same pixels/format) — no resize or crop. ' +
      'Use the AI 16:9 hero (or any art) and let the frontend adapt with CSS. ' +
      'Files live under `/static/events/banners/{eventUuid}/`; the previous file of that variant is deleted. ' +
      'Only members of the owning organization or an admin can upload.\n\n' +
      'Max upload size is 8MB.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { banner: { type: 'string', format: 'binary' } },
      required: ['banner']
    }
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiParam({ name: 'variant', enum: BANNER_VARIANT_NAMES, description: 'Platform variant.' })
  @ApiResponse({ status: 200, description: 'Banner uploaded. Returns the variant URL and the full `bannerImages` map.' })
  @ApiResponse({ status: 400, description: 'Unknown variant, missing file, not an image, or file too large (max 8MB).' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 403, description: 'User is not a member of the owning organization nor an admin.' })
  @UseInterceptors(FileInterceptor('banner'))
  @HttpCode(200)
  @Post(':eventUuid/banner/:variant')
  async uploadBanner(
    @Param('eventUuid') eventUuid: string,
    @Param('variant') variant: string,
    @UploadedFile(
      // 8MB: permite heroes IA a resolución nativa (sin resize en servidor)
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 8 * 1024 * 1024 })
        .build({ fileIsRequired: true })
    )
    file: Express.Multer.File,
    @User() loggedUser: string
  ): Promise<{ variant: BannerVariant; url: string; bannerImages: BannerImages }> {
    if (!isBannerVariant(variant)) {
      throw new BadRequestException(`Variante inválida. Valores permitidos: ${BANNER_VARIANT_NAMES.join(', ')}`);
    }
    return this._eventService.uploadBanner(eventUuid, variant, file, loggedUser);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Delete banner variant',
    description: 'Removes the image of a specific platform variant and deletes the file from storage.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiParam({ name: 'variant', enum: BANNER_VARIANT_NAMES, description: 'Platform variant.' })
  @ApiResponse({ status: 200, description: 'Variant removed. Returns the updated `bannerImages` map.' })
  @ApiResponse({ status: 400, description: 'Unknown variant or the event has no image for it.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 403, description: 'User is not a member of the owning organization nor an admin.' })
  @HttpCode(200)
  @Delete(':eventUuid/banner/:variant')
  async deleteBanner(
    @Param('eventUuid') eventUuid: string,
    @Param('variant') variant: string,
    @User() loggedUser: string
  ): Promise<{ bannerImages: BannerImages }> {
    if (!isBannerVariant(variant)) {
      throw new BadRequestException(`Variante inválida. Valores permitidos: ${BANNER_VARIANT_NAMES.join(', ')}`);
    }
    return this._eventService.deleteBanner(eventUuid, variant, loggedUser);
  }

  @OptionalUserAuth(null, EventMediaResponse)
  @ApiOperation({
    summary: 'List event gallery media',
    description:
      'Returns up to 4 gallery items. Published events are public; drafts require ownership token.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @HttpCode(200)
  @Get(':eventUuid/media')
  async getEventMedia(
    @Param('eventUuid') eventUuid: string,
    @OptionalUser() loggedUser: string | null
  ): Promise<EventMediaResponse[]> {
    const items = await this._eventService.getEventMedia(eventUuid, loggedUser);
    return items.map(item => new EventMediaResponse(item));
  }

  @UserAuth(null, EventMediaResponse)
  @ApiOperation({
    summary: 'Upload gallery media',
    description:
      'Uploads one gallery file (multipart field `media`). Max 4 active items per event. ' +
      'Images are compressed to WebP; videos are stored as-is (transcode pending). Max 20 MB.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { media: { type: 'string', format: 'binary' } },
      required: ['media']
    }
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @UseInterceptors(FileInterceptor('media'))
  @HttpCode(201)
  @Post(':eventUuid/media')
  async uploadEventMedia(
    @Param('eventUuid') eventUuid: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 20 * 1024 * 1024 })
        .build({ fileIsRequired: true })
    )
    file: Express.Multer.File,
    @User() loggedUser: string
  ): Promise<EventMediaResponse> {
    const item = await this._eventService.uploadEventMedia(eventUuid, file, loggedUser);
    return new EventMediaResponse(item);
  }

  @UserAuth(null, null)
  @ApiOperation({ summary: 'Delete gallery media item' })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiParam({ name: 'mediaUuid', description: 'Media UUID.' })
  @HttpCode(200)
  @Delete(':eventUuid/media/:mediaUuid')
  async deleteEventMedia(
    @Param('eventUuid') eventUuid: string,
    @Param('mediaUuid') mediaUuid: string,
    @User() loggedUser: string
  ): Promise<void> {
    return this._eventService.deleteEventMedia(eventUuid, mediaUuid, loggedUser);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'List producers assigned to the event',
    description:
      'Producers explicitly assigned to this event. Access via the event organization is NOT listed here — ' +
      'those users reach the event through `user_organization`.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiResponse({ status: 200, description: 'Assigned producers.' })
  @ApiResponse({ status: 403, description: 'No access to this event.' })
  @HttpCode(200)
  @Get(':eventUuid/producers')
  async getEventProducers(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<TEventProducer[]> {
    return this._eventService.getEventProducers(eventUuid, loggedUser);
  }

  @AdminAuth(AssignProducerRequest, null)
  @ApiOperation({
    summary: 'Assign a producer to the event',
    description:
      'Grants a specific user access to THIS event only (additive to organization membership). ' +
      'Idempotent: assigning someone already assigned is a no-op.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiResponse({ status: 200, description: 'Producer assigned.' })
  @ApiResponse({ status: 400, description: 'User not found.' })
  @ApiResponse({ status: 403, description: 'Requires the Administrador role.' })
  @HttpCode(200)
  @Post(':eventUuid/producers')
  async assignProducer(
    @Param('eventUuid') eventUuid: string,
    @Body() data: AssignProducerRequest,
    @User() loggedUser: string
  ): Promise<void> {
    await this._eventService.assignProducerToEvent(eventUuid, data.userUuid, loggedUser);
  }

  @AdminAuth(null, null)
  @ApiOperation({
    summary: 'Remove a producer from the event',
    description: 'Revokes the per-event assignment. Does not affect access granted by organization membership.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiParam({ name: 'userUuid', description: 'User UUID.' })
  @ApiResponse({ status: 200, description: 'Assignment removed.' })
  @ApiResponse({ status: 403, description: 'Requires the Administrador role.' })
  @HttpCode(200)
  @Delete(':eventUuid/producers/:userUuid')
  async removeProducer(
    @Param('eventUuid') eventUuid: string,
    @Param('userUuid') userUuid: string,
    @User() loggedUser: string
  ): Promise<void> {
    await this._eventService.removeProducerFromEvent(eventUuid, userUuid, loggedUser);
  }

  // ── Validadores del evento ────────────────────────────────────────────────
  // A diferencia de los productores usan @UserAuth: el productor dueño del
  // evento también arma su equipo de puerta. assertOwnership acota el alcance.

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'List validators assigned to the event',
    description: 'Door staff assigned to this event. Accessible to an admin or to the event owner.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiResponse({ status: 200, description: 'Assigned validators.' })
  @ApiResponse({ status: 403, description: 'No access to this event.' })
  @HttpCode(200)
  @Get(':eventUuid/validators')
  async getEventValidators(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
  ): Promise<TEventValidator[]> {
    return this._eventService.getEventValidators(eventUuid, loggedUser);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Search users to assign as validators',
    description:
      'Searches active users by first name, last name or email, excluding those already assigned. ' +
      'Returns up to 10 results; an empty `search` returns an empty list.\n\n' +
      'Exists as an event-scoped endpoint because `GET /users` is admin-only, and a producer ' +
      'must also be able to staff their own event.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiQuery({ name: 'search', required: false, description: 'Name or email fragment.' })
  @ApiResponse({ status: 200, description: 'Matching users.' })
  @ApiResponse({ status: 403, description: 'No access to this event.' })
  @HttpCode(200)
  @Get(':eventUuid/validators/candidates')
  async getValidatorCandidates(
    @Param('eventUuid') eventUuid: string,
    @Query('search') search: string,
    @User() loggedUser: string
  ): Promise<TUserSummary[]> {
    return this._eventService.getValidatorCandidates(eventUuid, search ?? '', loggedUser);
  }

  @UserAuth(AssignValidatorRequest, null)
  @ApiOperation({
    summary: 'Assign a validator to the event',
    description:
      'Assigns door staff to THIS event and grants the `Validador` role if the user does not ' +
      'already have it (the expected flow is that they register as a Cliente first). ' +
      'Idempotent: assigning someone already assigned is a no-op.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiResponse({ status: 200, description: 'Validator assigned.' })
  @ApiResponse({ status: 400, description: 'User not found, or the Validador role is missing.' })
  @ApiResponse({ status: 403, description: 'No access to this event.' })
  @HttpCode(200)
  @Post(':eventUuid/validators')
  async assignValidator(
    @Param('eventUuid') eventUuid: string,
    @Body() data: AssignValidatorRequest,
    @User() loggedUser: string
  ): Promise<void> {
    await this._eventService.assignValidatorToEvent(eventUuid, data.userUuid, loggedUser);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Remove a validator from the event',
    description:
      'Removes the assignment. The `Validador` role is NOT revoked — the person may still be ' +
      'working the door at other events.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiParam({ name: 'userUuid', description: 'User UUID.' })
  @ApiResponse({ status: 200, description: 'Assignment removed.' })
  @ApiResponse({ status: 403, description: 'No access to this event.' })
  @HttpCode(200)
  @Delete(':eventUuid/validators/:userUuid')
  async removeValidator(
    @Param('eventUuid') eventUuid: string,
    @Param('userUuid') userUuid: string,
    @User() loggedUser: string
  ): Promise<void> {
    await this._eventService.removeValidatorFromEvent(eventUuid, userUuid, loggedUser);
  }

  @UserAuth(null, TicketTypeResponse)
  @ApiOperation({ summary: 'List ticket types', description: 'Returns all active ticket types for an event.' })
  @HttpCode(200)
  @Get(':eventUuid/ticket-types')
  async getTicketTypes(@Param('eventUuid') eventUuid: string): Promise<TicketTypeResponse[]> {
    const items = await this._eventService.getTicketTypes(eventUuid);
    return items.map(tt => new TicketTypeResponse(tt));
  }

  @UserAuth(BulkCreateTicketTypesRequest, TicketTypeResponse)
  @ApiOperation({
    summary: 'Create ticket types (bulk)',
    description:
      'Creates every ticket type of the payload in a single request and initializes their stock in Redis. ' +
      'Preferred over the single-item endpoint: an event with 50 tandas is one request, not 50.'
  })
  @HttpCode(201)
  @Post(':eventUuid/ticket-types/bulk')
  async createTicketTypesBulk(
    @Param('eventUuid') eventUuid: string,
    @Body() data: BulkCreateTicketTypesRequest,
    @User() loggedUser: string
  ): Promise<TicketTypeResponse[]> {
    const items = await this._eventService.createTicketTypes(eventUuid, data.items, loggedUser);
    return items.map(tt => new TicketTypeResponse(tt));
  }

  @UserAuth(BulkUpdateTicketTypesRequest, TicketTypeResponse)
  @ApiOperation({
    summary: 'Update ticket types (bulk)',
    description: 'Updates every ticket type of the payload in a single request. Each item carries the uuid it patches.'
  })
  @HttpCode(200)
  @Patch(':eventUuid/ticket-types/bulk')
  async updateTicketTypesBulk(
    @Param('eventUuid') eventUuid: string,
    @Body() data: BulkUpdateTicketTypesRequest,
    @User() loggedUser: string
  ): Promise<TicketTypeResponse[]> {
    const items = await this._eventService.updateTicketTypes(eventUuid, data.items, loggedUser);
    return items.map(tt => new TicketTypeResponse(tt));
  }

  @UserAuth(BulkDeleteTicketTypesRequest, null)
  @ApiOperation({
    summary: 'Delete ticket types (bulk)',
    description:
      'Deactivates every ticket type of the payload in a single request. Used when the event map is ' +
      'regenerated and the previous map tandas have to be cleared. Fails if any of them has sales.'
  })
  @HttpCode(200)
  @Post(':eventUuid/ticket-types/bulk-delete')
  async deleteTicketTypesBulk(
    @Param('eventUuid') eventUuid: string,
    @Body() data: BulkDeleteTicketTypesRequest,
    @User() loggedUser: string
  ): Promise<void> {
    await this._eventService.deleteTicketTypes(eventUuid, data.uuids, loggedUser);
  }

  @UserAuth(UpdateTicketTypeRequest, TicketTypeResponse)
  @ApiOperation({ summary: 'Update ticket type', description: 'Updates a ticket type. Price cannot be changed once the event is published.' })
  @HttpCode(200)
  @Patch(':eventUuid/ticket-types/:ticketTypeUuid')
  async updateTicketType(
    @Param('eventUuid') eventUuid: string,
    @Param('ticketTypeUuid') ticketTypeUuid: string,
    @Body() data: UpdateTicketTypeRequest,
    @User() loggedUser: string
  ): Promise<TicketTypeResponse> {
    const ticketType = await this._eventService.updateTicketType(eventUuid, ticketTypeUuid, data, loggedUser);
    return new TicketTypeResponse(ticketType);
  }

  @UserAuth(CreateTicketTypeRequest, TicketTypeResponse)
  @ApiOperation({ summary: 'Create ticket type', description: 'Creates a new ticket type for an event and initializes its stock in Redis.' })
  @HttpCode(201)
  @Post(':eventUuid/ticket-types')
  async createTicketType(
    @Param('eventUuid') eventUuid: string,
    @Body() data: CreateTicketTypeRequest,
    @User() loggedUser: string
  ): Promise<TicketTypeResponse> {
    const ticketType = await this._eventService.createTicketType(eventUuid, data, loggedUser);
    return new TicketTypeResponse(ticketType);
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Delete ticket type (soft)',
    description: 'Deactivates a ticket type on a draft event. Not allowed if the type has sales or the event is published.'
  })
  @HttpCode(200)
  @Delete(':eventUuid/ticket-types/:ticketTypeUuid')
  async deleteTicketType(
    @Param('eventUuid') eventUuid: string,
    @Param('ticketTypeUuid') ticketTypeUuid: string,
    @User() loggedUser: string
  ): Promise<void> {
    return this._eventService.deleteTicketType(eventUuid, ticketTypeUuid, loggedUser);
  }

  // ── Gastos del evento (FP08 / BR-BACKOFFICE-006) ──────────────────────────
  // Visibilidad: Productor dueño o Administrador. El Cliente nunca.

  @UserAuth(null, EventExpensesResponse)
  @ApiOperation({
    summary: 'List event expenses',
    description:
      'Cost lines of the event plus the per-category aggregate used by the dashboard. ' +
      'Filters narrow `items`, but `byCategory` always reflects the WHOLE event: the dashboard ' +
      'breakdown must not change with the table filter.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiQuery({ name: 'category', required: false, enum: EXPENSE_CATEGORIES })
  @ApiQuery({ name: 'supplier', required: false, description: 'Partial match.' })
  @ApiResponse({ status: 403, description: 'No access to this event.' })
  @HttpCode(200)
  @Get(':eventUuid/expenses')
  async getExpenses(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string,
    @Query('category') category?: string,
    @Query('supplier') supplier?: string
  ): Promise<EventExpensesResponse> {
    const result = await this._eventService.getExpenses(eventUuid, loggedUser, { category, supplier });
    return new EventExpensesResponse(
      result.items.map(item => new EventExpenseResponse(item)),
      result.byCategory.map(c => new ExpenseCategoryTotalResponse(c.category as never, c.total))
    );
  }

  @UserAuth(CreateExpenseRequest, EventExpenseResponse)
  @ApiOperation({
    summary: 'Create expense line',
    description: 'Adds a cost line. `totalAmount` is computed as quantity × unitCost — never sent by the client.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @HttpCode(201)
  @Post(':eventUuid/expenses')
  async createExpense(
    @Param('eventUuid') eventUuid: string,
    @Body() data: CreateExpenseRequest,
    @User() loggedUser: string
  ): Promise<EventExpenseResponse> {
    return new EventExpenseResponse(await this._eventService.createExpense(eventUuid, data, loggedUser));
  }

  @UserAuth(UpdateExpenseRequest, EventExpenseResponse)
  @ApiOperation({
    summary: 'Update expense line',
    description: 'Partial update. Changing quantity or unitCost recomputes `totalAmount`.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiParam({ name: 'expenseUuid', description: 'Expense UUID.' })
  @HttpCode(200)
  @Patch(':eventUuid/expenses/:expenseUuid')
  async updateExpense(
    @Param('eventUuid') eventUuid: string,
    @Param('expenseUuid') expenseUuid: string,
    @Body() data: UpdateExpenseRequest,
    @User() loggedUser: string
  ): Promise<EventExpenseResponse> {
    return new EventExpenseResponse(
      await this._eventService.updateExpense(eventUuid, expenseUuid, data, loggedUser)
    );
  }

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Delete expense line',
    description: 'Logical delete: the cost history is kept for auditing.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @ApiParam({ name: 'expenseUuid', description: 'Expense UUID.' })
  @HttpCode(200)
  @Delete(':eventUuid/expenses/:expenseUuid')
  async deleteExpense(
    @Param('eventUuid') eventUuid: string,
    @Param('expenseUuid') expenseUuid: string,
    @User() loggedUser: string
  ): Promise<void> {
    await this._eventService.deleteExpense(eventUuid, expenseUuid, loggedUser);
  }
}
