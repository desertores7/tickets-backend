import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { IOrderService } from '../services/contracts/iorder.service';
import { OrderStatus } from '../services/core/order';
import { CreateOrderRequest } from './dtos/create-order/create-order.request';
import { GetOrderResponse } from './dtos/get-order/get-order.response';
import { GetUserOrdersResponse, OrderSummaryResponse } from './dtos/get-user-orders/get-user-orders.response';

@ApiTags('Orders')
@Controller('orders')
export class OrderController {
  constructor(@Inject('IOrderService') private readonly _orderService: IOrderService) {}

  // ---------------------------------------------------------------------------
  // POST /api/orders
  // ---------------------------------------------------------------------------

  @UserAuth(CreateOrderRequest, null)
  @ApiOperation({
    summary: 'Create order',
    description:
      'Validates the event and requested ticket types, reserves stock atomically in Redis, ' +
      'persists the order and its line items in a single MySQL transaction, and enqueues a ' +
      'delayed `release-expired-stock` job that fires after 10 minutes if the order remains unpaid.\n\n' +
      'Stock reservation uses a Lua script to prevent overselling under concurrent load.'
  })
  @ApiResponse({ status: 201, type: GetOrderResponse, description: 'Order created. Expires in 10 minutes if payment is not completed.' })
  @ApiResponse({ status: 400, description: 'Validation error — missing or malformed fields in request body.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 404, description: 'Event not found, or one of the requested ticket types does not belong to that event.' })
  @ApiResponse({ status: 409, description: 'Insufficient stock for one or more of the requested ticket types.' })
  @ApiResponse({ status: 422, description: 'Event is not published / active, sale period has not started or has ended, or quantity is outside the allowed range for a ticket type.' })
  @HttpCode(201)
  @Post()
  async createOrder(@Body() body: CreateOrderRequest, @User() userId: string): Promise<GetOrderResponse> {
    const order = await this._orderService.createOrder(userId, {
      eventUuid: body.eventUuid,
      items: body.items.map(item => ({
        ticketTypeUuid: item.ticketTypeId,
        quantity: item.quantity
      }))
    });
    return new GetOrderResponse(order);
  }

  // ---------------------------------------------------------------------------
  // GET /api/orders
  // ---------------------------------------------------------------------------

  @UserAuth(null, GetUserOrdersResponse)
  @ApiOperation({
    summary: 'List my orders',
    description:
      'Returns a paginated list of all orders belonging to the authenticated user, sorted by ' +
      'creation date descending. Each item includes a summary with status, total and item count.'
  })
  @ApiResponse({ status: 200, type: GetUserOrdersResponse, description: 'Paginated list of orders.' })
  @ApiResponse({ status: 400, description: 'Invalid pagination parameters.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiPagination()
  @HttpCode(200)
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OrderStatus,
    description: 'Filtra por estado de la orden. Sin valor devuelve todas.'
  })
  @Get()
  async getUserOrders(
    @PaginationParams() pagination: IPaginationParams,
    @User() userId: string,
    @Query('status') status?: string
  ): Promise<GetUserOrdersResponse> {
    if (status && !Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw new BadRequestException(`status debe ser uno de: ${Object.values(OrderStatus).join(', ')}`);
    }

    const result = await this._orderService.getUserOrders(userId, pagination, status);
    return new GetUserOrdersResponse(
      result.items.map(o => new OrderSummaryResponse(o)),
      result.meta
    );
  }

  // ---------------------------------------------------------------------------
  // GET /api/orders/:orderId
  // ---------------------------------------------------------------------------

  @UserAuth(null, GetOrderResponse)
  @ApiOperation({
    summary: 'Get order by ID',
    description:
      'Returns full order details including all line items and their individual tickets. ' +
      'Only the owner of the order can access it.'
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID.', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, type: GetOrderResponse, description: 'Order details with items and tickets.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 404, description: 'Order not found or does not belong to the authenticated user.' })
  @HttpCode(200)
  @Get(':orderId')
  async getOrderById(@Param('orderId') orderId: string, @User() userId: string): Promise<GetOrderResponse> {
    const order = await this._orderService.getOrderById(orderId, userId);
    return new GetOrderResponse(order);
  }

  // ---------------------------------------------------------------------------
  // DELETE /api/orders/:orderId
  // ---------------------------------------------------------------------------

  @UserAuth(null, null)
  @ApiOperation({
    summary: 'Cancel order',
    description:
      'Cancels an order that is still in `pending_payment` status and immediately releases ' +
      'the reserved stock back to the Redis pool so other buyers can purchase those tickets.'
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID.', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, description: 'Order cancelled and reserved stock released.' })
  @ApiResponse({ status: 401, description: 'JWT token missing, invalid or expired.' })
  @ApiResponse({ status: 404, description: 'Order not found or does not belong to the authenticated user.' })
  @ApiResponse({ status: 422, description: 'Order is not in `pending_payment` status and cannot be cancelled.' })
  @HttpCode(200)
  @Delete(':orderId')
  async cancelOrder(@Param('orderId') orderId: string, @User() userId: string): Promise<void> {
    return this._orderService.cancelOrder(orderId, userId);
  }
}
