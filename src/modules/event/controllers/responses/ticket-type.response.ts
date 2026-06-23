import { ApiProperty } from '@nestjs/swagger';
import { TTicketTypeResponse } from '@modules/event/services/contracts/ievent.service';

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
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
