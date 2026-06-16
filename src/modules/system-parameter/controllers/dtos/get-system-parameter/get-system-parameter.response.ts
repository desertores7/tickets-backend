import { ApiProperty } from '@nestjs/swagger';
import { SystemParameterEntity } from '@config/db/entities/system/system_parameter.entity';

export class GetSystemParameterResponse {
  @ApiProperty({
    name: 'uuid',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  uuid: string;

  @ApiProperty({
    name: 'key',
    example: 'conversation.expired.minutes'
  })
  key: string;

  @ApiProperty({
    name: 'value',
    example: '1440'
  })
  value: string;

  @ApiProperty({
    name: 'description',
    example: 'Minutos sin actualizar (updatedAt) para marcar una conversación pendiente como vencida',
    nullable: true
  })
  description: string | null;

  @ApiProperty({
    name: 'type',
    example: 'number'
  })
  type: string;

  @ApiProperty({
    name: 'createdAt',
    example: '2024-01-01T00:00:00.000Z'
  })
  createdAt: Date;

  @ApiProperty({
    name: 'updatedAt',
    example: '2024-01-01T00:00:00.000Z'
  })
  updatedAt: Date;

  @ApiProperty({
    name: 'createdBy',
    example: '123e4567-e89b-12d3-a456-426614174000',
    nullable: true
  })
  createdBy: string | null;

  @ApiProperty({
    name: 'updatedBy',
    example: '123e4567-e89b-12d3-a456-426614174000',
    nullable: true
  })
  updatedBy: string | null;

  constructor(data: SystemParameterEntity) {
    this.uuid = data.uuid;
    this.key = data.key;
    this.value = data.value;
    this.description = data.description;
    this.type = data.type;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.createdBy = data.createdBy;
    this.updatedBy = data.updatedBy;
  }
}
