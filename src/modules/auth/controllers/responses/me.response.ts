import { ApiProperty } from '@nestjs/swagger';
import { isProfileFile } from '@config/db/const/file-type.const';
import { TMeResponse } from '@modules/auth/services/contracts/iauth.service';
import { resolveActiveRole } from '@root/shared/auth/utils/active-role';

export class MeImgProfileResponse {
  @ApiProperty({ name: 'url' })
  url: string;

  @ApiProperty({ name: 'type' })
  type: string;

  constructor(url: string, type: string) {
    this.url = url;
    this.type = type;
  }
}

export class MeRoleResponse {
  @ApiProperty({ name: 'uuid' })
  uuid: string;

  @ApiProperty({ name: 'name' })
  name: string;

  constructor(uuid: string, name: string) {
    this.uuid = uuid;
    this.name = name;
  }
}

export class MeOrganizationResponse {
  @ApiProperty({ name: 'uuid' })
  uuid: string;

  @ApiProperty({ name: 'name' })
  name: string;

  @ApiProperty({ name: 'active' })
  active: number;

  constructor(data: { uuid: string; name: string; active: number }) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.active = data.active;
  }
}

export class MeUserResponse {
  @ApiProperty({ name: 'uuid' })
  uuid: string;

  @ApiProperty({ name: 'firstName' })
  firstName: string;

  @ApiProperty({ name: 'lastName' })
  lastName: string;

  @ApiProperty({ name: 'email' })
  email: string;

  @ApiProperty({ name: 'username', type: String, nullable: true })
  username: string | null;

  @ApiProperty({ name: 'phone', type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ name: 'dni', type: String, nullable: true })
  dni: string | null;

  @ApiProperty({
    name: 'documentType',
    enum: ['DNI', 'Pasaporte', 'Documento extranjero', 'Otro'],
    nullable: true,
    required: false
  })
  documentType: 'DNI' | 'Pasaporte' | 'Documento extranjero' | 'Otro' | null;

  @ApiProperty({ name: 'gender', type: String, nullable: true })
  gender: string | null;

  @ApiProperty({ name: 'birthday', type: String, format: 'date-time', nullable: true })
  birthday: Date | null;

  @ApiProperty({ name: 'emailVerified' })
  emailVerified: boolean;

  @ApiProperty({ name: 'termsAcceptedAt', type: String, format: 'date-time', nullable: true, required: false })
  termsAcceptedAt: Date | null;

  @ApiProperty({ name: 'twoAuthentication' })
  twoAuthentication: boolean;

  @ApiProperty({ name: 'active' })
  active: number;

  @ApiProperty({ name: 'imgProfile', type: MeImgProfileResponse })
  imgProfile: MeImgProfileResponse;

  constructor(data: TMeResponse) {
    const profileFile = data.files?.find(file => isProfileFile(file) && !file.isDeleted);
    this.uuid = data.uuid;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email;
    this.username = data.username ?? null;
    this.phone = data.phone ?? null;
    this.dni = data.dni ?? null;
    this.documentType = data.documentType ?? null;
    this.gender = data.gender ?? null;
    this.birthday = data.birthday ?? null;
    this.emailVerified = data.emailVerified;
    this.termsAcceptedAt = data.termsAcceptedAt ?? null;
    this.twoAuthentication = Boolean(data.twoAuthentication);
    this.active = data.active;
    this.imgProfile = new MeImgProfileResponse(profileFile?.path || '', profileFile?.type || '');
  }
}

export class MeResponse {
  @ApiProperty({ name: 'user', type: MeUserResponse })
  user: MeUserResponse;

  @ApiProperty({ name: 'role', type: MeRoleResponse, nullable: true, required: false })
  role: MeRoleResponse | null;

  @ApiProperty({ name: 'organizations', type: [MeOrganizationResponse] })
  organizations: MeOrganizationResponse[];

  constructor(data: TMeResponse) {
    // Mismo criterio que el login: si divergen, el perfil dice un rol y el menú se comporta como otro.
    const activeRole = resolveActiveRole(data.userRoles as any);

    this.user = new MeUserResponse(data);
    this.role = activeRole ? new MeRoleResponse(activeRole.uuid, activeRole.name) : null;
    this.organizations = (data.userOrganizations ?? [])
      .filter(uo => !uo.isDeleted && uo.organization && !uo.organization.isDeleted)
      .map(
        uo =>
          new MeOrganizationResponse({
            uuid: uo.organization.uuid,
            name: uo.organization.name,
            active: uo.organization.active
          })
      );
  }
}
