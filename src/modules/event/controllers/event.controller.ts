import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { UserRole } from '@root/shared/auth/decorator/user-role.decorator';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { ApiSearch, ISearchParams, SearchParams } from '@root/shared/decorators/search-query.decorator';
import { ApiFilter, FilterParams, IFiltersParams } from '@root/shared/decorators/filter-query.decorator';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';
import { IEventService } from '../services/contracts/ievent.service';
import { eventFilters } from './const/event.filters';
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

  @UserAuth(null, GetAllEventResponse)
  @ApiOperation({ summary: 'List public events', description: 'Returns published and active events with pagination, search and filters.' })
  @ApiPagination()
  @ApiSearch()
  @ApiFilter(eventFilters)
  @HttpCode(200)
  @Get()
  async getEvents(
    @PaginationParams() pagination: IPaginationParams,
    @SearchParams() search: ISearchParams,
    @FilterParams(eventFilters) filters: IFiltersParams<typeof eventFilters>,
    @UserRole() role: string | null
  ): Promise<{ meta: PaginationMetaResponse; items: GetAllEventResponse[] }> {
    const result = await this._eventService.getEvents(pagination, search, filters, role);
    return {
      meta: result.meta,
      items: result.items.map(item => new GetAllEventResponse(item))
    };
  }

  @UserAuth(null, GetIdEventResponse)
  @ApiOperation({ summary: 'Get event by ID', description: 'Returns event details including ticket types.' })
  @HttpCode(200)
  @Get(':eventUuid')
  async getEventById(@Param('eventUuid') eventUuid: string): Promise<GetIdEventResponse> {
    const event = await this._eventService.getEventById(eventUuid);
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
