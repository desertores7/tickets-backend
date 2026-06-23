import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAuth } from '@root/shared/auth/decorator/user-auth.decorator';
import { User } from '@root/shared/auth/decorator/user.decorator';
import { ApiPagination, IPaginationParams, PaginationParams } from '@root/shared/decorators/pagination-query.decorator';
import { IOrderService } from '../services/contracts/iorder.service';
import { CreateOrderRequest } from './dtos/create-order/create-order.request';
import { GetOrderResponse } from './dtos/get-order/get-order.response';
import { GetUserOrdersResponse, OrderSummaryResponse } from './dtos/get-user-orders/get-user-orders.response';

@ApiTags('Orders')
@Controller({ path: 'orders', version: '1' })
export class OrderController {
  constructor(@Inject('IOrderService') private readonly _orderService: IOrderService) {}

  @UserAuth(CreateOrderRequest, null)
  @ApiResponse({
    status: 201,
    type: GetOrderResponse,
    description: 'Order created. Expires in 10 minutes if payment is not confirmed.'
  })
  @ApiOperation({
    summary: 'Create order',
    description:
      'Validates the event and ticket types, reserves stock in Redis, persists the order and its items in a single transaction, and enqueues a delayed job to release stock if the order expires unpaid.\n\n' +
      '**Errors:**\n' +
      '- `404` — Event or ticket type not found\n' +
      '- `409` — Not enough stock for one of the requested ticket types\n' +
      '- `422` — Event not published / sale period closed / quantity out of allowed range'
  })
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

  @UserAuth(null, GetUserOrdersResponse)
  @ApiOperation({
    summary: 'List my orders',
    description: 'Returns a paginated list of all orders belonging to the authenticated user, newest first.'
  })
  @ApiPagination()
  @HttpCode(200)
  @Get()
  async getUserOrders(@PaginationParams() pagination: IPaginationParams, @User() userId: string): Promise<GetUserOrdersResponse> {
    const result = await this._orderService.getUserOrders(userId, pagination);
    return new GetUserOrdersResponse(
      result.items.map(o => new OrderSummaryResponse(o)),
      result.meta
    );
  }

  @UserAuth(null, GetOrderResponse)
  @ApiOperation({
    summary: 'Get order by ID',
    description:
      'Returns full order details including line items and tickets. Only the owner of the order can access it.\n\n' +
      '**Errors:**\n' +
      '- `404` — Order not found or does not belong to the authenticated user'
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @HttpCode(200)
  @Get(':orderId')
  async getOrderById(@Param('orderId') orderId: string, @User() userId: string): Promise<GetOrderResponse> {
    const order = await this._orderService.getOrderById(orderId, userId);
    return new GetOrderResponse(order);
  }

  @UserAuth(null, null)
  @ApiResponse({ status: 200, description: 'Order cancelled and reserved stock released.' })
  @ApiOperation({
    summary: 'Cancel order',
    description:
      'Cancels an order that is still in `pending_payment` status and immediately releases the reserved stock back to the pool.\n\n' +
      '**Errors:**\n' +
      '- `404` — Order not found or does not belong to the authenticated user\n' +
      '- `422` — Order is not in `pending_payment` status'
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @HttpCode(200)
  @Delete(':orderId')
  async cancelOrder(@Param('orderId') orderId: string, @User() userId: string): Promise<void> {
    return this._orderService.cancelOrder(orderId, userId);
  }
}
