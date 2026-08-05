import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsUUID } from 'class-validator';

/**
 * Vincula usuarios YA existentes a una organización.
 * Se diferencia de AssignUserOrganizationRequest, que crea un usuario nuevo.
 */
export class LinkUsersOrganizationRequest {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  @ApiProperty({
    description: 'UUIDs de usuarios existentes a vincular con la organización',
    type: [String],
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890']
  })
  userUuids: string[];
}
