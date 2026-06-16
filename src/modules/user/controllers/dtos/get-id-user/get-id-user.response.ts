import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';

export class GetIdUserResponse {
  @ApiProperty({
    name: 'uuid'
  })
  uuid: string;
  @ApiProperty({
    name: 'dni',
    required: false
  })
  dni: string | null;

  @ApiProperty({
    name: 'firstName'
  })
  firstName: string;

  @ApiProperty({
    name: 'lastName'
  })
  lastName: string;

  @ApiProperty({
    name: 'email'
  })
  email: string;

  @ApiProperty({
    name: 'username',
    required: false
  })
  username?: string | null;

  @ApiProperty({
    name: 'roleUuid'
  })
  roleUuid: string;

  @ApiProperty({
    name: 'role'
  })
  role: string;

  @ApiProperty({
    name: 'gender',
    required: false
  })
  gender: string | null;

  @ApiProperty({
    name: 'birthday',
    nullable: true
  })
  birthday: Date | null;

  @ApiProperty({
    name: 'active'
  })
  active: number;

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

  constructor(data: TEntityResponse<'user', undefined, undefined> & { role: string; roleUuid: string }) {
    this.uuid = data.uuid;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email;
    this.username = data.username || null;
    this.role = data.role;
    this.roleUuid = data.roleUuid;
    this.birthday = data.birthday;
    this.dni = data.dni;
    this.gender = data.gender;
    this.active = data.active;
  }
}
