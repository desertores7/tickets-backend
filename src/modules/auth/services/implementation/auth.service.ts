import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
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
import { RegisterAuthRequest } from '@modules/auth/controllers/requests/register-auth.request';
import { resolveActiveRole } from '@root/shared/auth/utils/active-role';

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    protected readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly imageCompressionService: ImageCompressionService
  ) {}

  private readonly defaultRoleNames = ['Usuario', 'usuario', 'user', 'patient', 'clinic_admin'];
  /**
   * Rol asignado a quien se registra desde el sitio público (comprador).
   * Sembrado por la migración SeedClienteRole; `user_role` tiene FK contra
   * `role`, así que este UUID tiene que existir sí o sí.
   */
  private readonly roleUserUuid = 'd4f8a1c3-5b27-4e69-9a04-3c71e8b5d2f6';
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

  private isLocalEnvironment(): boolean {
    const env = String(this.config.get<string>('ENV') || '').toLowerCase();
    const nodeEnv = String(this.config.get<string>('NODE_ENV') || '').toLowerCase();
    return env === 'local' || env === 'dev' || nodeEnv === 'development';
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

    if (!user.active) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    if (!user.emailVerified && !this.isLocalEnvironment()) {
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
          ? resolveActiveRole(user.userRoles as any)?.name || ''
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
    user.documentType = request.documentType;
    user.dni = request.documentNumber.trim();
    user.email = request.email;
    user.password = await this.hash(request.password);
    user.active = 1;
    user.emailVerified = false;
    user.emailVerifiedAt = null;
    user.termsAcceptedAt = new Date();
    user.twoAuthentication = false;
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

    // Antes se creaba acá una organización "Organización {nombre} {apellido}"
    // y se vinculaba al usuario. Es herencia del proyecto base (un SaaS donde
    // cada cuenta tenía su propio espacio) y en la ticketera no corresponde: un
    // comprador no es un organizador, y esa membresía le daba alcance sobre
    // eventos en toda consulta que filtre por user_organization.

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

    // Silencio deliberado si el correo no existe: responder distinto convertiría
    // este endpoint público en un oráculo para saber qué direcciones tienen
    // cuenta. El controller devuelve 200 con un mensaje neutro en ambos casos.
    if (!user) {
      this.logger.warn(`Reset de contraseña pedido para un correo inexistente: ${email}`);
      return;
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

  /**
   * Cambio de contraseña desde el perfil. Endpoint propio y no un campo más de
   * `updateMe` porque exige la contraseña actual: sin esa comprobación, un token
   * robado alcanzaría para quedarse con la cuenta.
   */
  async changePassword(userUuid: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid, isDeleted: IsNull() }
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const matches = await bcryptjs.compare(currentPassword, user.password ?? '');
    if (!matches) {
      this.logger.warn(`Cambio de contraseña rechazado para ${user.email}: contraseña actual incorrecta`);
      throw new BadRequestException('La contraseña actual no es correcta');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    }

    await this.dbRepository.update({
      entity: 'user',
      where: { uuid: userUuid },
      data: { password: await this.hash(newPassword), updatedBy: userUuid }
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
    if (usernameToSet !== undefined) userData.username = usernameToSet;
    if (data.phone !== undefined) userData.phone = data.phone?.trim() || null;
    if (data.gender !== undefined) userData.gender = data.gender?.trim() || null;
    if (data.birthday !== undefined) {
      userData.birthday = data.birthday?.trim() ? new Date(data.birthday) : null;
    }
    if (data.address !== undefined) userData.address = data.address?.trim() || null;
    if (data.billingIdType !== undefined) {
      userData.billingIdType = (data.billingIdType?.trim() || null) as UserEntity['billingIdType'];
    }
    if (data.billingIdNumber !== undefined) {
      userData.billingIdNumber = data.billingIdNumber?.trim() || null;
    }
    if (data.billingLegalName !== undefined) {
      userData.billingLegalName = data.billingLegalName?.trim() || null;
    }
    if (data.billingVatCondition !== undefined) {
      userData.billingVatCondition = (data.billingVatCondition?.trim() ||
        null) as UserEntity['billingVatCondition'];
    }
    if (data.billingFiscalAddress !== undefined) {
      userData.billingFiscalAddress = data.billingFiscalAddress?.trim() || null;
    }
    if (data.billingEmail !== undefined) {
      userData.billingEmail = data.billingEmail?.trim() || null;
    }
    if (data.twoAuthentication !== undefined) {
      userData.twoAuthentication = data.twoAuthentication;
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

  /**
   * Baja de cuenta: desactiva el usuario e invalida todas las sesiones de token.
   * El login ya rechaza usuarios inactivos.
   */
  async deactivateAccount(userUuid: string): Promise<void> {
    await this.loadMeUser(userUuid);

    await this.dbRepository.update({
      entity: 'user',
      where: { uuid: userUuid },
      data: { active: 0, updatedBy: userUuid }
    });

    await this.dbRepository.delete({
      entity: 'user_token_session',
      where: { userUuid }
    });

    this.logger.log(`Cuenta desactivada: ${userUuid}`);
  }
}
