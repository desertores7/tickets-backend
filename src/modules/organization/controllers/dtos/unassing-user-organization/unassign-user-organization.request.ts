import { ApiProperty } from '@nestjs/swagger';
import { TEntityResponse } from '@config/db/meta/db.types';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { IUnassignUserOrganization } from '@modules/organization/services/core/organization';

export class UnassignUserOrganizationRequest {
  @IsNotEmpty()
  @IsArray()
  @ApiProperty({
    name: 'userUuids',
    description: 'User uuids to unassign from the organization'
  })
  userUuids: string[];

  constructor(data: IUnassignUserOrganization) {
    this.userUuids = data.userUuids;
  }
}
