import { ApiProperty } from '@nestjs/swagger';
import { FileEntity } from '@config/db/entities/user/file.entity';
import {
  ORGANIZATION_FISCAL_KIND_BY_FILE_TYPE_UUID
} from '@config/db/const/file-type.const';
import type { OrganizationFiscalDocumentKind } from '@modules/organization/const/organization-fiscal.const';

export class FiscalDocumentResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  originalName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty({
    enum: ['dni', 'afip_constancia', 'cbu_proof', 'iibb', 'estatuto', 'other']
  })
  documentKind: OrganizationFiscalDocumentKind;

  @ApiProperty()
  createdAt: Date;

  constructor(file: FileEntity) {
    this.uuid = file.uuid;
    this.originalName = file.originalName || 'documento';
    this.mimeType = file.type;
    this.sizeBytes = file.sizeBytes ?? 0;
    this.documentKind =
      ORGANIZATION_FISCAL_KIND_BY_FILE_TYPE_UUID[file.fileTypeUuid] ?? 'other';
    this.createdAt = file.createdAt;
  }
}
