import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { IAssignUserOrganization } from '@modules/organization/services/core/organization';

export class AssignUserOrganizationRequest implements IAssignUserOrganization {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'User first name'
  })
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'User last name'
  })
  lastName: string;

  @IsEmail()
  @ApiProperty({
    description: 'User email'
  })
  email: string;

  @IsString()
  @MinLength(6)
  @ApiProperty({
    description: 'User password'
  })
  password: string;

  constructor(data: IAssignUserOrganization) {
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email;
    this.password = data.password;
  }
}
