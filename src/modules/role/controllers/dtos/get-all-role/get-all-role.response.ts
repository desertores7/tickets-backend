import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';

export class GetAllRoleResponse {
  @ApiProperty({
    name: 'uuid'
  })
  uuid: string;

  @ApiProperty({
    name: 'name'
  })
  name: string;

  @ApiProperty({
    name: 'isDeleted'
  })
  isDeleted: Date | null;

  @ApiProperty({
    name: 'createdAt'
  })
  createdAt: Date;

  @ApiProperty({
    name: 'updatedAt'
  })
  updatedAt: Date;

  @ApiProperty({
    name: 'createdBy'
  })
  createdBy: string | null;

  @ApiProperty({
    name: 'updatedBy'
  })
  updatedBy: string | null;

  constructor(data: TEntityResponse<'role', undefined, undefined>) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.isDeleted = data.isDeleted;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.createdBy = data.createdBy;
    this.updatedBy = data.updatedBy;
  }
}
