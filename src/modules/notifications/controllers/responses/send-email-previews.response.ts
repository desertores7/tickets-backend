import { ApiProperty } from '@nestjs/swagger';
import { TEmailPreviewResult } from '../../services/implementation/email-preview.service';

export class EmailPreviewResultItem {
  @ApiProperty({ description: 'Identificador corto del email dentro de este envío.' })
  key: string;

  @ApiProperty({ description: 'Nombre del template .hbs renderizado (sin extensión).' })
  template: string;

  @ApiProperty({ description: 'Rol / origen del email dentro de la plataforma.' })
  audience: string;

  @ApiProperty()
  subject: string;

  @ApiProperty({ enum: ['sent', 'error'] })
  status: 'sent' | 'error';

  @ApiProperty({ required: false, nullable: true })
  error: string | null;

  constructor(data: TEmailPreviewResult) {
    this.key = data.key;
    this.template = data.template;
    this.audience = data.audience;
    this.subject = data.subject;
    this.status = data.status;
    this.error = data.error ?? null;
  }
}

export class SendEmailPreviewsResponse {
  @ApiProperty({ description: 'Casilla a la que se mandaron todos los correos.' })
  email: string;

  @ApiProperty()
  total: number;

  @ApiProperty()
  sent: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ type: [EmailPreviewResultItem] })
  results: EmailPreviewResultItem[];

  constructor(email: string, results: TEmailPreviewResult[]) {
    this.email = email;
    this.results = results.map(r => new EmailPreviewResultItem(r));
    this.total = results.length;
    this.sent = results.filter(r => r.status === 'sent').length;
    this.failed = results.filter(r => r.status === 'error').length;
  }
}
