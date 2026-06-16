import { ApiProperty } from '@nestjs/swagger';

export class MessageResponse {
  @ApiProperty({
    name: 'message'
  })
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

export class MessageWithIdResponse extends MessageResponse {
  @ApiProperty({
    name: 'id'
  })
  id: string;

  constructor(id: string, message: string = '') {
    super(message);
    this.id = id;
  }
}
