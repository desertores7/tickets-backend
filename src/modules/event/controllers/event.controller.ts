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
  Query,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { OptionalUserAuth } from '@root/shared/auth/decorator/optional-user-auth.decorator';
import { OptionalUser } from '@root/shared/auth/decorator/optional-user.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { UserRole } from '@root/shared/auth/decorator/user-role.decorator';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { ApiFilter, FilterParams, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IEventService } from '../services/contracts/ievent.service';
import { eventFilters } from './const/event.filters';
import {
  BANNER_VARIANT_NAMES,
  BannerImages,
  BannerVariant,
  isBannerVariant
} from './const/banner-variant.const';
import { CreateEventRequest } from './requests/create-event.request';
import { UpdateEventRequest } from './requests/update-event.request';
import { CreateTicketTypeRequest } from './requests/create-ticket-type.request';
import { UpdateTicketTypeRequest } from './requests/update-ticket-type.request';
import { GetAllEventResponse } from './responses/get-all-event.response';
import { GetIdEventResponse } from './responses/get-id-event.response';
import { TicketTypeResponse } from './responses/ticket-type.response';
import { GetFeeSummaryResponse } from './dtos/get-fee-summary/get-fee-summary.response';

@ApiTags('Events')
@Controller({ path: 'events', version: '1' })
export class EventController {
  constructor(@Inject('IEventService') private readonly _eventService: IEventService) {}

  @UserAuth(CreateEventRequest, null)
  @ApiOperation({ summary: 'Create event', description: 'Creates a new event for an organization. Requester must be a member of the organization.' })
  @HttpCode(201)
  @Post()
  async createEvent(@Body() data: CreateEventRequest, @User() loggedUser: string): Promise<boolean> {
    return this._eventService.createEvent(data, loggedUser);
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
  @Get()
  async getEvents(
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(eventFilters) filters: IFiltersParams<typeof eventFilters>,
    @UserRole() role: string | null,
    @OptionalUser() loggedUser: string | null,
    @Query('mine') mine?: string
  ): Promise<{ meta: PaginationMetaResponse; items: GetAllEventResponse[] }> {
    // `mine` solo aplica con sesión; sin token cae siempre a la vista pública
    const isMine = mine === 'true' && !!loggedUser;
    const result = await this._eventService.getEvents(pagination, search, filters, role, {
      mine: isMine,
      loggedUser
    });
    return {
      meta: result.meta,
      items: result.items.map(item => new GetAllEventResponse(item))
    };
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
      'Returns the accumulated fee summary for an event (paid orders, tickets sold, gross/ticket/service-fee amounts). ' +
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
  async getFeeSummary(@Param('eventUuid') eventUuid: string, @User() loggedUser: string): Promise<GetFeeSummaryResponse> {
    const summary = await this._eventService.getFeeSummary(eventUuid, loggedUser);
    return new GetFeeSummaryResponse(summary);
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
    summary: 'Upload event banner (per platform)',
    description:
      'Uploads one banner image per platform variant (multipart/form-data, field `banner`).\n\n' +
      '**Variants and target sizes:**\n' +
      '- `desktop` — 1920x640 (3:1), hero web. Also syncs the legacy `bannerUrl` field.\n' +
      '- `mobile` — 1080x1350 (4:5), portrait for phones.\n' +
      '- `thumbnail` — 800x450 (16:9), cards and listings.\n\n' +
      'Each variant accepts its own source image (art direction) and is normalized to webp, ' +
      'cropped centred to the target aspect ratio. Files are stored per event in ' +
      '`/static/events/banners/{eventUuid}/` and the previous file of that variant is deleted. ' +
      'Only members of the owning organization or an admin can upload.\n\n' +
      'Max upload size is 4MB — kept under the 4.5MB body limit of the frontend proxy (Vercel).'
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
  @ApiResponse({ status: 400, description: 'Unknown variant, missing file, not an image, or file too large (max 4MB).' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 403, description: 'User is not a member of the owning organization nor an admin.' })
  @UseInterceptors(FileInterceptor('banner'))
  @HttpCode(200)
  @Post(':eventUuid/banner/:variant')
  async uploadBanner(
    @Param('eventUuid') eventUuid: string,
    @Param('variant') variant: string,
    @UploadedFile(
      // 4MB: por debajo del límite de body (4.5MB) del proxy del frontend en Vercel
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 4 * 1024 * 1024 })
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
    summary: 'Delete event banner variant',
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

  @UserAuth(null, TicketTypeResponse)
  @ApiOperation({ summary: 'List ticket types', description: 'Returns all active ticket types for an event.' })
  @HttpCode(200)
  @Get(':eventUuid/ticket-types')
  async getTicketTypes(@Param('eventUuid') eventUuid: string): Promise<TicketTypeResponse[]> {
    const items = await this._eventService.getTicketTypes(eventUuid);
    return items.map(tt => new TicketTypeResponse(tt));
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
}
