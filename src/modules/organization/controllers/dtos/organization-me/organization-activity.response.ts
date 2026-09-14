import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ORGANIZATION_ACTIVITY_KINDS,
  type OrganizationActivityKind
} from '@modules/organization/const/organization-activity.const';
import { OrganizationActivityEntity } from '@config/db/entities/user/organization_activity.entity';

export class OrganizationActivityItemResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty({ enum: ORGANIZATION_ACTIVITY_KINDS })
  kind: OrganizationActivityKind;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  detail: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  payload: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  actorUserUuid: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  constructor(row: OrganizationActivityEntity) {
    this.uuid = row.uuid;
    this.kind = row.kind;
    this.title = row.title;
    this.detail = row.detail ?? null;
    this.payload = row.payload ?? null;
    this.actorUserUuid = row.actorUserUuid ?? null;
    this.createdAt = row.createdAt;
  }
}
