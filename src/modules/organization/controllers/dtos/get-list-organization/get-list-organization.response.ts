import { ApiProperty } from '@nestjs/swagger';
import { TOrganizationResponse } from '@modules/organization/services/contracts/iorganization.service';

export class GetListOrganizationResponse {
  @ApiProperty({
    name: 'uuid'
  })
  uuid: string;

  @ApiProperty({
    name: 'name'
  })
  name: string;

  constructor(data: TOrganizationResponse) {
    this.uuid = data.uuid;
    this.name = data.name;
  }
}
