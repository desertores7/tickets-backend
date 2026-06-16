import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DBRepository } from '@config/db/db.repository';
import { IAuthService, IUpdateMeData, TUserLoginAuthResponse, TMeResponse } from '../contracts/iauth.service';
import { v4 as uuidv4 } from 'uuid';
import { IUser, IUserTokenSession } from '@modules/user/services/core/user';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '@root/shared/auth/services/email.service';
import { UserTokenSessionEntity } from '@config/db/entities/user/user_token_session.entity';
import * as bcryptjs from 'bcryptjs';
import { IsNull, QueryRunner } from 'typeorm';
import { TEntityResponse } from '@config/db/meta/db.types';
import { UserRoleEntity } from '@config/db/entities/user/user_role.entity';
import { RoleEntity } from '@config/db/entities/user/role.entity';
import { FileEntity } from '@config/db/entities/user/file.entity';
import { FileTypeEntity } from '@config/db/entities/user/file_type.entity';
import { PROFILE_FILE_TYPE_NAME, PROFILE_FILE_TYPE_UUID } from '@config/db/const/file-type.const';
import { UserEntity } from '@config/db/entities/user/user.entity';
import { ImageCompressionService } from '@root/shared/services/image-compression.service';
import { UserOrganizationEntity } from '@config/db/entities/user/user_organization.entity';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { RegisterAuthRequest } from '@modules/auth/controllers/requests/register-auth.request';

@Injectable()
export class AuthService implements IAuthService {
  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    protected readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly imageCompressionService: ImageCompressionService
  ) {}

  private readonly defaultRoleNames = ['Operador', 'Usuario', 'usuario', 'user', 'patient', 'clinic_admin'];
  private readonly roleUserUuid = '3c987e4a-6432-11f1-aef5-c8e8d4beeaa8';
  private readonly superAdminRoleUuid = '58f10bc6-a38c-4876-9d38-c11351e376b8';

  private async resolveDefaultRoleUuid(createdBy?: string): Promise<string> {
    for (const roleName of this.defaultRoleNames) {
      const role = await this.dbRepository.findOne({
        entity: 'role',
        where: { name: roleName, isDeleted: IsNull() }
      });
      if (role) return role.uuid;
    }

    const role = new RoleEntity();
    role.uuid = uuidv4();
    role.name = 'Usuario';
    role.isDeleted = null;
    role.createdBy = createdBy ?? null;
    role.updatedBy = createdBy ?? null;
    await this.dbRepository.create({ entity: 'role', data: role });
    return role.uuid;
  }

  public async hash(v: string) {
    const salt = await bcryptjs.genSalt(10);
    return bcryptjs.hash(v, salt);
  }
  private compare(raw: string, hash: string) {
    return bcryptjs.compare(raw, hash);
  }

  private generateLoginCode(length = 6): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const alphaNumeric = `${letters}${numbers}`;

    // Force at least one letter and one number.
    const required = [
      letters[Math.floor(Math.random() * letters.length)],
      numbers[Math.floor(Math.random() * numbers.length)]
    ];

    while (required.length < length) {
      required.push(alphaNumeric[Math.floor(Math.random() * alphaNumeric.length)]);
    }

    for (let i = required.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [required[i], required[j]] = [required[j], required[i]];
    }

    return required.join('');
  }

  private async authenticateUserByCredentials(
    emailOrUsername: string,
    password: string
  ): Promise<TEntityResponse<'user', { files: true; userTokenSessions: true; userRoles: { role: true } }, undefined>> {
    const identifier = (emailOrUsername || '').trim();
    if (!identifier) throw new UnauthorizedException('Usuario o contraseña incorrectos');

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: [
        { email: identifier, isDeleted: IsNull() },
        { username: identifier, isDeleted: IsNull() }
      ],
      relations: {
        files: true,
        userTokenSessions: true,
        userRoles: {
          role: true
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email no verificado. Verifique su bandeja de entrada.');
    }

    const localPasswordOk = await this.compare(password, user.password);
    if (!localPasswordOk) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const hasUserRole = user.userRoles && Array.isArray(user.userRoles) && user.userRoles.length > 0;
    if (!hasUserRole) {
      const roleUuid = await this.resolveDefaultRoleUuid(user.uuid);
      const userRole = new UserRoleEntity();
      userRole.uuid = uuidv4();
      userRole.userUuid = user.uuid;
      userRole.roleUuid = roleUuid;
      userRole.createdAt = new Date();
      userRole.createdBy = user.uuid;
      await this.dbRepository.create({
        entity: 'user_role',
        data: userRole
      });
    }

    return user as TEntityResponse<
      'user',
      { files: true; userTokenSessions: true; userRoles: { role: true } },
      undefined
    >;
  }

  public async signTokens(user: TUserLoginAuthResponse | IUser): Promise<{ access: string; refresh: string }> {
    const payload = {
      sub: user.uuid,
      email: user.email,
      role:
        'userRoles' in user
          ? user.userRoles?.find((userRole: any) => userRole.userUuid === user.uuid)?.role?.name || ''
          : ''
    };
    const access = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES') || '15m'
    });
    const refresh = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES') || '7d'
    });
    return { access, refresh };
  }

  public refreshExpToDate(): Date {
    const exp = this.config.get('JWT_REFRESH_EXPIRES') || '7d';
    // soporte simple: 7d, 15m, etc.
    const now = new Date();
    const n = parseInt(exp);
    if (exp.endsWith('d')) now.setDate(now.getDate() + n);
    else if (exp.endsWith('h')) now.setHours(now.getHours() + n);
    else if (exp.endsWith('m')) now.setMinutes(now.getMinutes() + n);
    else now.setDate(now.getDate() + 7);
    return now;
  }

  public async setRefresh(userId: string, accessToken: string, refreshToken: string) {
    await this.dbRepository.delete({
      entity: 'user_token_session',
      where: { userUuid: userId }
    });

    const hash = await this.hash(refreshToken);
    const session = new UserTokenSessionEntity();
    session.uuid = uuidv4();
    session.userUuid = userId;
    session.access_token = accessToken;
    session.refresh_token = hash;
    session.isDeleted = null;
    session.createdAt = this.refreshExpToDate();

    await this.dbRepository.create({
      entity: 'user_token_session',
      data: session
    });
  }

  public async createTokenSession(
    userId: string,
    accessToken: string,
    refreshToken: string,
    queryRunner?: QueryRunner
  ): Promise<void> {
    const hash = await this.hash(refreshToken);
    const session = new UserTokenSessionEntity();
    session.uuid = uuidv4();
    session.userUuid = userId;
    session.access_token = accessToken;
    session.refresh_token = hash;
    session.isDeleted = null;
    session.createdAt = this.refreshExpToDate();

    await this.dbRepository.create({
      entity: 'user_token_session',
      data: session,
      queryRunner: queryRunner
    });
  }

  private async buildLoginResponse(user: IUser): Promise<TUserLoginAuthResponse> {
    const { access, refresh } = await this.signTokens(user);
    await this.setRefresh(user.uuid, access, refresh);

    // Recargar el usuario con todas las relaciones actualizadas
    const reloadedUser = await this.dbRepository.findOne({
      entity: 'user',
      where: {
        uuid: user.uuid,
        isDeleted: IsNull()
      },
      relations: {
        files: true,
        userTokenSessions: true,
        userRoles: {
          role: true
        },
        userOrganizations: {
          organization: true
        }
      }
    });

    if (!reloadedUser) throw new UnauthorizedException('Usuario no encontrado después de la autenticación');

    const userWithRelations = reloadedUser as TEntityResponse<
      'user',
      { files: true; userTokenSessions: true; userRoles: { role: true }; userOrganizations: { organization: true } },
      undefined
    >;

    return {
      ...userWithRelations,
      access_token: access,
      refresh_token: refresh,
      userUuid: userWithRelations.uuid,
      imgProfile: {},
      files: userWithRelations.files || [],
      userRoles: userWithRelations.userRoles || [],
      userTokenSessions: userWithRelations.userTokenSessions || [],
      userOrganizations: userWithRelations.userOrganizations || []
    };
  }

  async startLoginCodeAuth(emailOrUsername: string, password: string): Promise<void> {
    const user = await this.authenticateUserByCredentials(emailOrUsername, password);
    const code = this.generateLoginCode(6);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);
    const createdAt = new Date();

    const existingSessions = await this.dbRepository.findMany({
      entity: 'user_session',
      where: {
        userUuid: user.uuid
      }
    });

    if (existingSessions.length > 0) {
      const latest = existingSessions.reduce((a, b) =>
        new Date(a.createdAt).getTime() >= new Date(b.createdAt).getTime() ? a : b
      );

      for (const row of existingSessions) {
        if (row.uuid !== latest.uuid) {
          await this.dbRepository.delete({
            entity: 'user_session',
            where: { uuid: row.uuid }
          });
        }
      }

      await this.dbRepository.update({
        entity: 'user_session',
        where: { uuid: latest.uuid },
        data: {
          code,
          isUsed: false,
          expiresAt,
          createdAt
        }
      });
    } else {
      await this.dbRepository.create({
        entity: 'user_session',
        data: {
          uuid: uuidv4(),
          userUuid: user.uuid,
          code,
          isUsed: false,
          expiresAt,
          createdAt
        }
      });
    }

    await this.emailService.initializeSmtp();
    await this.emailService.sendLoginCodeEmail({
      firstName: user.firstName || user.username || 'Usuario',
      email: user.email,
      code
    });
  }

  async validateLoginCodeAuth(emailOrUsername: string, code: string): Promise<TUserLoginAuthResponse> {
    const identifier = (emailOrUsername || '').trim();

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: [
        {
          email: identifier,
          isDeleted: IsNull()
        },
        {
          username: identifier,
          isDeleted: IsNull()
        }
      ],
      relations: {
        files: true,
        userTokenSessions: true,
        userRoles: {
          role: true
        },
        userOrganizations: {
          organization: true
        }
      }
    });

    if (!user) {
      throw new BadRequestException('Codigo incorrecto, intente nuevamente');
    }

    const userSession = await this.dbRepository.findOne({
      entity: 'user_session',
      where: {
        userUuid: user.uuid,
        code: code.trim().toUpperCase(),
        isUsed: false
      },
      other: {
        order: {
          createdAt: 'DESC'
        }
      }
    });

    if (!userSession) {
      throw new BadRequestException('Codigo incorrecto, intente nuevamente');
    }

    if (userSession.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired code');
    }

    await this.dbRepository.update({
      entity: 'user_session',
      where: { uuid: userSession.uuid },
      data: { isUsed: true }
    });

    return this.buildLoginResponse(user);
  }

  async userLoginAuth(emailOrUsername: string, password: string): Promise<TUserLoginAuthResponse> {
    const user = await this.authenticateUserByCredentials(emailOrUsername, password);
    return this.buildLoginResponse(user);
  }

  private getFrontendUrl(): string {
    return (this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
  }

  private async signEmailVerificationToken(userUuid: string, email: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userUuid, email, purpose: 'email-verification' },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: '24h'
      }
    );
  }

  private async verifyEmailVerificationToken(token: string): Promise<{ userUuid: string; email: string }> {
    let payload: { sub?: string; email?: string; purpose?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET')
      });
    } catch {
      throw new BadRequestException('Invalid or expired verification link');
    }

    if (payload.purpose !== 'email-verification' || !payload.sub || !payload.email) {
      throw new BadRequestException('Invalid verification link');
    }

    return { userUuid: payload.sub, email: payload.email };
  }

  private async signPasswordResetToken(userUuid: string, email: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userUuid, email, purpose: 'password-reset' },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: '1h'
      }
    );
  }

  private async verifyPasswordResetToken(token: string): Promise<{ userUuid: string; email: string }> {
    let payload: { sub?: string; email?: string; purpose?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET')
      });
    } catch {
      throw new BadRequestException('Invalid or expired reset link');
    }

    if (payload.purpose !== 'password-reset' || !payload.sub || !payload.email) {
      throw new BadRequestException('Invalid reset link');
    }

    return { userUuid: payload.sub, email: payload.email };
  }

  async registerAuth(request: RegisterAuthRequest): Promise<{ email: string; uuid: string }> {
    const existing = await this.dbRepository.findOne({
      entity: 'user',
      where: { email: request.email, isDeleted: IsNull() }
    });
    if (existing) throw new BadRequestException('El email ya se encuentra registrado');

    const user = new UserEntity();
    user.uuid = uuidv4();
    user.firstName = request.firstName.trim();
    user.lastName = request.lastName.trim();
    user.email = request.email;
    user.password = await this.hash(request.password);
    user.active = 1;
    user.emailVerified = false;
    user.emailVerifiedAt = null;
    user.isDeleted = null;
    await this.dbRepository.create({ entity: 'user', data: user });

    const userRole = new UserRoleEntity();
    userRole.uuid = uuidv4();
    userRole.userUuid = user.uuid;
    userRole.roleUuid = this.roleUserUuid;
    userRole.createdBy = user.uuid;
    userRole.updatedBy = user.uuid;
    await this.dbRepository.create({ entity: 'user_role', data: userRole });

    const verificationToken = await this.signEmailVerificationToken(user.uuid, request.email);
    const validationUrl = `${this.getFrontendUrl()}/validate-email?token=${encodeURIComponent(verificationToken)}`;

    try {
      await this.emailService.initializeSmtp();
      await this.emailService.sendRegistrationEmail({
        firstName: user.firstName,
        email: request.email,
        validationUrl
      });
    } catch (error) {
      console.error('Failed to send registration email:', error);
    }

    return { email: request.email, uuid: user.uuid };
  }

  async resendEmailVerification(email: string): Promise<void> {
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { email, isDeleted: IsNull() }
    });

    if (!user) {
      throw new BadRequestException('No existe un usuario con este correo');
    }

    if (user.emailVerified) {
      throw new BadRequestException('El correo ya fue verificado');
    }

    const verificationToken = await this.signEmailVerificationToken(user.uuid, email);
    const validationUrl = `${this.getFrontendUrl()}/validate-email?token=${encodeURIComponent(verificationToken)}`;

    await this.emailService.initializeSmtp();
    await this.emailService.sendRegistrationEmail({
      firstName: user.firstName || user.username || 'Usuario',
      email,
      validationUrl
    });
  }

  async validateEmailAuth(token: string): Promise<{ verified: boolean; alreadyVerified: boolean; message: string }> {
    const { userUuid, email } = await this.verifyEmailVerificationToken(token);

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid, email, isDeleted: IsNull() }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      return {
        verified: true,
        alreadyVerified: true,
        message: 'El correo ya fue validado anteriormente.'
      };
    }

    await this.dbRepository.update({
      entity: 'user',
      where: { uuid: userUuid },
      data: { emailVerified: true, emailVerifiedAt: new Date() }
    });

    try {
      await this.emailService.initializeSmtp();
      await this.emailService.sendEmailVerifiedEmail({
        firstName: user.firstName || user.username || 'Usuario',
        email: user.email
      });
    } catch (error) {
      console.error('Failed to send email verified confirmation:', error);
    }

    if (user?.emailVerified === false) {
      const organization: OrganizationEntity = new OrganizationEntity();
      const organizationUuid = uuidv4();
      organization.uuid = organizationUuid;
      organization.name = `Organización ${user.firstName} ${user.lastName}`;
      organization.createdAt = new Date();
      await this.dbRepository.create({
        entity: 'organization',
        data: organization
      });

      const userOrganization: UserOrganizationEntity = new UserOrganizationEntity();
      userOrganization.uuid = uuidv4();
      userOrganization.userUuid = user.uuid;
      userOrganization.organizationUuid = organizationUuid;
      userOrganization.createdAt = new Date();
      await this.dbRepository.create({
        entity: 'user_organization',
        data: userOrganization
      });
    }

    return {
      verified: true,
      alreadyVerified: false,
      message: 'Correo validado correctamente.'
    };
  }

  async sendResetPassword(email: string): Promise<void> {
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { email, isDeleted: IsNull() }
    });
    if (!user) {
      throw new BadRequestException('No existe un usuario con este correo');
    }

    const resetToken = await this.signPasswordResetToken(user.uuid, email);
    const resetUrl = `${this.getFrontendUrl()}/new-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;

    await this.emailService.initializeSmtp();
    await this.emailService.sendResetPasswordEmail({
      firstName: user.firstName || user.username || 'Usuario',
      email,
      resetUrl
    });
  }

  async resetPassword(email: string, password: string, token: string): Promise<void> {
    const { userUuid, email: tokenEmail } = await this.verifyPasswordResetToken(token);

    if (tokenEmail.toLowerCase() !== email.trim().toLowerCase()) {
      throw new BadRequestException('El link de restablecimiento de contraseña no es válido para este correo');
    }

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid, email: tokenEmail, isDeleted: IsNull() }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hashedPassword = await this.hash(password);
    await this.dbRepository.update({
      entity: 'user',
      where: { uuid: userUuid },
      data: { password: hashedPassword }
    });
  }

  private async loadMeUser(userUuid: string): Promise<TMeResponse> {
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid, isDeleted: IsNull() },
      relations: {
        files: true,
        userRoles: { role: true },
        userOrganizations: { organization: true }
      }
    });

    if (!user) throw new NotFoundException('User not found');

    return user as TMeResponse;
  }

  async getMe(userUuid: string): Promise<TMeResponse> {
    return this.loadMeUser(userUuid);
  }

  private async resolveProfileFileTypeUuid(): Promise<string> {
    const existing = await this.dbRepository.findOne({
      entity: 'file_type',
      where: { name: PROFILE_FILE_TYPE_NAME, isDeleted: IsNull() }
    });
    if (existing) return existing.uuid;

    const fileType = new FileTypeEntity();
    fileType.uuid = PROFILE_FILE_TYPE_UUID;
    fileType.name = PROFILE_FILE_TYPE_NAME;
    fileType.isDeleted = null;
    fileType.createdBy = null;
    fileType.updatedBy = null;
    await this.dbRepository.create({ entity: 'file_type', data: fileType });
    return fileType.uuid;
  }

  private async upsertProfileImage(userUuid: string, file: Express.Multer.File): Promise<void> {
    const { path, type } = await this.imageCompressionService.saveUserProfileImage(userUuid, file);
    const profileFileTypeUuid = await this.resolveProfileFileTypeUuid();

    const existingProfile = await this.dbRepository.findOne({
      entity: 'file',
      where: {
        userUuid,
        fileTypeUuid: profileFileTypeUuid,
        isDeleted: IsNull()
      }
    });

    if (existingProfile) {
      await this.dbRepository.update({
        entity: 'file',
        where: { uuid: existingProfile.uuid },
        data: { path, type, updatedBy: userUuid }
      });
      return;
    }

    const fileEntity = new FileEntity();
    fileEntity.uuid = uuidv4();
    fileEntity.userUuid = userUuid;
    fileEntity.path = path;
    fileEntity.type = type;
    fileEntity.fileTypeUuid = profileFileTypeUuid;
    fileEntity.isDeleted = null;
    fileEntity.createdBy = userUuid;
    fileEntity.updatedBy = userUuid;
    await this.dbRepository.create({ entity: 'file', data: fileEntity });
  }

  async updateMe(authenticatedUserUuid: string, data: IUpdateMeData): Promise<TMeResponse> {
    await this.loadMeUser(authenticatedUserUuid);

    if (data.email) {
      const existingUser = await this.dbRepository.findOne({
        entity: 'user',
        where: { email: data.email, isDeleted: IsNull() }
      });
      if (existingUser && existingUser.uuid !== authenticatedUserUuid) {
        throw new BadRequestException('El email ya se encuentra registrado');
      }
    }

    let usernameToSet: string | null | undefined = undefined;
    if (data.username !== undefined) {
      usernameToSet = data.username?.trim() ? data.username.trim() : null;
      if (usernameToSet) {
        const existingByUsername = await this.dbRepository.findOne({
          entity: 'user',
          where: { username: usernameToSet, isDeleted: IsNull() }
        });
        if (existingByUsername && existingByUsername.uuid !== authenticatedUserUuid) {
          throw new BadRequestException('El nombre de usuario ya se encuentra registrado');
        }
      }
    }

    const userData: Partial<UserEntity> = {};
    if (data.firstName !== undefined) userData.firstName = data.firstName;
    if (data.lastName !== undefined) userData.lastName = data.lastName;
    if (data.email !== undefined) userData.email = data.email;
    if (usernameToSet !== undefined) userData.username = usernameToSet;
    if (data.phone !== undefined) userData.phone = data.phone?.trim() || null;
    if (data.dni !== undefined) userData.dni = data.dni?.trim() || null;
    if (data.gender !== undefined) userData.gender = data.gender?.trim() || null;
    if (data.birthday !== undefined) {
      userData.birthday = data.birthday?.trim() ? new Date(data.birthday) : null;
    }
    if (data.password?.trim()) {
      userData.password = await this.hash(data.password);
    }

    const hasUserFieldUpdates = Object.keys(userData).length > 0;
    if (hasUserFieldUpdates) {
      userData.updatedBy = authenticatedUserUuid;
      await this.dbRepository.update({
        entity: 'user',
        where: { uuid: authenticatedUserUuid },
        data: userData
      });
    }

    if (data.imgProfile) {
      await this.upsertProfileImage(authenticatedUserUuid, data.imgProfile);
    }

    return this.loadMeUser(authenticatedUserUuid);
  }
}
