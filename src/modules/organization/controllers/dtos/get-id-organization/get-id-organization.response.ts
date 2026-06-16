import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';
import { TOrganizationResponseWithUserOrganizations } from '@modules/organization/services/contracts/iorganization.service';
import { PaginationMetaResponse } from '@root/shared/responses/pagination-meta.response';

export class UserOrganizationResponse {
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

  constructor(data: TEntityResponse<'user', undefined, undefined>) {
    this.uuid = data.uuid;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
  }
}

export class OrganizationUsersListResponse {
  @ApiProperty({ type: [UserOrganizationResponse] })
  items: UserOrganizationResponse[];

  @ApiProperty({ type: PaginationMetaResponse })
  meta: PaginationMetaResponse;

  constructor(items: UserOrganizationResponse[], meta: PaginationMetaResponse) {
    this.items = items;
    this.meta = meta;
  }
}

export class GetIdOrganizationResponse {
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

  @ApiProperty({
    name: 'userOrganizations'
  })
  userOrganizations: UserOrganizationResponse[];

  constructor(data: TOrganizationResponseWithUserOrganizations) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.isDeleted = data.isDeleted;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.createdBy = data.createdBy;
    this.updatedBy = data.updatedBy;
    this.userOrganizations = data.userOrganizations.map(
      userOrganization => new UserOrganizationResponse(userOrganization.user)
    );
  }
}
