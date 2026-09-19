import { ApiProperty } from '@nestjs/swagger';
import { TTicketTypeResponse } from '@modules/event/services/contracts/ievent.service';
import {
  getTicketSalesStatus,
  TicketSalesStatus
} from '@modules/event/services/core/ticket-sales-policy';

export class TicketTypeResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty() price: number;
  @ApiProperty() currency: string;
  @ApiProperty() quantity: number;
  @ApiProperty() availableQuantity: number;
  @ApiProperty() minPerOrder: number;
  @ApiProperty() maxPerOrder: number;
  @ApiProperty({ nullable: true }) saleStartDate: Date | null;
  @ApiProperty({ nullable: true }) saleEndDate: Date | null;
  @ApiProperty({ enum: ['general', 'per_person', 'whole_unit'] }) saleMode: 'general' | 'per_person' | 'whole_unit';
  @ApiProperty({ nullable: true, description: 'Entradas por unidad completa (solo whole_unit)' })
  admissionsPerUnit: number | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ description: 'Habilitación manual de venta; independiente de la baja lógica.' })
  salesEnabled: boolean;
  @ApiProperty() sortOrder: number;
  @ApiProperty({
    enum: ['disabled', 'upcoming', 'available', 'sold_out', 'expired'],
    description: 'Estado calculado según habilitación manual, ventana de venta y stock confirmado'
  })
  status: TicketSalesStatus;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  constructor(data: TTicketTypeResponse) {
    this.uuid = data.uuid;
    this.eventUuid = data.eventUuid;
    this.name = data.name;
    this.description = data.description;
    this.price = Number(data.price);
    this.currency = data.currency;
    this.quantity = data.quantity;
    this.availableQuantity = data.availableQuantity;
    this.minPerOrder = data.minPerOrder;
    this.maxPerOrder = data.maxPerOrder;
    this.saleStartDate = data.saleStartDate;
    this.saleEndDate = data.saleEndDate;
    this.saleMode = data.saleMode ?? 'general';
    this.admissionsPerUnit = data.admissionsPerUnit ?? null;
    this.isActive = data.isActive;
    this.salesEnabled = data.salesEnabled;
    this.sortOrder = data.sortOrder;
    this.status = getTicketSalesStatus(data);
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /**
   * Calcula el estado de la tanda en función de la ventana de venta y stock.
   * - upcoming: saleStartDate es futuro
   * - expired: saleEndDate ya pasó
   * - sold_out: sin stock disponible (availableQuantity === 0)
   * - available: dentro de la ventana y con stock
   */
  static computeStatus(data: TTicketTypeResponse): TicketSalesStatus {
    return getTicketSalesStatus(data);
  }
}
