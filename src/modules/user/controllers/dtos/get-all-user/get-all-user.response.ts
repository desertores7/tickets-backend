import { ApiProperty } from '@nestjs/swagger';
import { isProfileFile } from '@config/db/const/file-type.const';
import { TEntityResponse } from '@config/db/meta/db.types';

export class GetAllUserResponse {
  @ApiProperty({
    name: 'uuid'
  })
  uuid: string;

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
    name: 'dni',
    required: false
  })
  dni: string | null;

  @ApiProperty({
    name: 'imgProfile'
  })
  imgProfile?: object;

  @ApiProperty({
    name: 'role'
  })
  role: string;

  @ApiProperty({
    name: 'roleUuid'
  })
  roleUuid: string;

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

  @ApiProperty({
    name: 'organizationUuids',
    required: false,
    description: 'UUIDs de las organizaciones asociadas al usuario (user_organization)',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000']
  })
  organizationUuids?: string[];

  constructor(
    data: TEntityResponse<'user', { files: true }, undefined> & {
      imgProfile: object;
      role: string;
      roleUuid: string;
      organizationUuids?: string[];
    }
  ) {
    this.uuid = data.uuid;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email;
    this.username = data.username || null;
    this.role = data.role;
    this.roleUuid = data.roleUuid;
    this.imgProfile = {
      url: data.files?.find(file => isProfileFile(file))?.path || '',
      type: data.files?.find(file => isProfileFile(file))?.type || ''
    };
    this.birthday = data.birthday;
    this.dni = data.dni;
    this.gender = data.gender;
    this.active = data.active;
    this.isDeleted = data.isDeleted;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.createdBy = data.createdBy;
    this.updatedBy = data.updatedBy;
    this.organizationUuids = Array.isArray((data as any).organizationUuids) ? (data as any).organizationUuids : [];
  }
}
