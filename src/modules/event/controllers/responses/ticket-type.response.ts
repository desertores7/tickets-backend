import { ApiProperty } from '@nestjs/swagger';
import { TTicketTypeResponse } from '@modules/event/services/contracts/ievent.service';

export type TicketTypeStatus = 'upcoming' | 'available' | 'sold_out' | 'expired';

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
  @ApiProperty() isActive: boolean;
  @ApiProperty() sortOrder: number;
  @ApiProperty({
    enum: ['upcoming', 'available', 'sold_out', 'expired'],
    description: 'Estado calculado de la tanda según ventana de venta y stock'
  })
  status: TicketTypeStatus;
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
    this.isActive = data.isActive;
    this.sortOrder = data.sortOrder;
    this.status = TicketTypeResponse.computeStatus(data);
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
  static computeStatus(data: TTicketTypeResponse): TicketTypeStatus {
    const now = new Date();

    if (data.saleStartDate && now < new Date(data.saleStartDate)) {
      return 'upcoming';
    }

    if (data.saleEndDate && now > new Date(data.saleEndDate)) {
      return 'expired';
    }

    if (data.availableQuantity <= 0) {
      return 'sold_out';
    }

    return 'available';
  }
}
