import { ApiProperty } from '@nestjs/swagger';
import { TEventEmployee, TEventEmployeeRole } from '../../services/contracts/ievent.service';
import { EVENT_EMPLOYEE_ROLES } from '../requests/upsert-event-employee.request';

export class EventEmployeeResponse {
  @ApiProperty()
  uuid: string;

  @ApiProperty()
  userUuid: string;

  @ApiProperty({ enum: EVENT_EMPLOYEE_ROLES })
  role: TEventEmployeeRole;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  constructor(data: TEventEmployee) {
    this.uuid = data.uuid;
    this.userUuid = data.userUuid;
    this.role = data.role;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email;
    this.createdAt = data.createdAt;
  }
}
