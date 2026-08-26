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
import { AdminAuth } from '@root/shared/auth/decorator/admin-auth.decorator';
import { OptionalUserAuth } from '@root/shared/auth/decorator/optional-user-auth.decorator';
import { OptionalUser } from '@root/shared/auth/decorator/optional-user.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { UserRole } from '@root/shared/auth/decorator/user-role.decorator';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { ApiFilter, FilterParams, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IEventService, TEventProducer, TEventValidator, TUserSummary } from '../services/contracts/ievent.service';
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
import { AssignProducerRequest } from './requests/assign-producer.request';
import { AssignValidatorRequest } from './requests/assign-validator.request';
import { GetAllEventResponse } from './responses/get-all-event.response';
import { GetIdEventResponse } from './responses/get-id-event.response';
import { TicketTypeResponse } from './responses/ticket-type.response';
import { GetFeeSummaryResponse } from './dtos/get-fee-summary/get-fee-summary.response';
import { EventMediaResponse } from './responses/event-media.response';

@ApiTags('Events')
@Controller({ path: 'events', version: '1' })
export class EventController {
  constructor(@Inject('IEventService') private readonly _eventService: IEventService) {}

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

  @UserAuth(null, EventMediaResponse)
  @ApiOperation({
    summary: 'List event gallery media',
    description: 'Returns up to 4 gallery items (images/videos) for the event. Owner only.'
  })
  @ApiParam({ name: 'eventUuid', description: 'Event UUID.' })
  @HttpCode(200)
  @Get(':eventUuid/media')
  async getEventMedia(
    @Param('eventUuid') eventUuid: string,
    @User() loggedUser: string
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
}
