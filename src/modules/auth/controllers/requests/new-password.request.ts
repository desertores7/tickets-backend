import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class NewPasswordRequest {
  @IsNotEmpty()
  @MaxLength(36)
  @IsString()
  @ApiProperty({
    name: 'userUuid'
  })
  userUuid: string;

  @IsNotEmpty()
  @MaxLength(255)
  @IsString()
  @Matches(/(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'The password must have a Uppercase, lowercase letter and a number'
  })
  @ApiProperty({ name: 'password' })
  password: string;
}
