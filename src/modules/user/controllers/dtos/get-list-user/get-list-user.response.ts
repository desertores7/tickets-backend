import { IUserList } from '@modules/user/services/core/user';
import { ApiProperty } from '@nestjs/swagger';

export class GetListUserResponse {
  @ApiProperty({
    name: 'uuid'
  })
  uuid: string;

  @ApiProperty({
    name: 'name'
  })
  name: string;

  @ApiProperty({
    name: 'username'
  })
  username: string;

  @ApiProperty({
    name: 'organizationUuids',
    required: false,
    description: 'UUIDs de las organizaciones asociadas al usuario',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000']
  })
  organizationUuids?: string[];

  constructor(data: IUserList) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.username = data.username;
    this.organizationUuids = Array.isArray(data.organizationUuids) ? data.organizationUuids : [];
  }
}
