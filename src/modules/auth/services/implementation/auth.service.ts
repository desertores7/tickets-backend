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
import { IAuthService, IUpdateMeData, TUserLoginAuthResponse, TMeResponse, TLoginAuthResult } from '../contracts/iauth.service';
import { v4 as uuidv4 } from 'uuid';
import { IUser, IUserTokenSession } from '@modules/user/services/core/user';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '@root/shared/auth/services/email.service';
import { UserTokenSessionEntity } from '@config/db/entities/user/user_token_session.entity';
import { UserSessionEntity } from '@config/db/entities/user/user_session.entity';
import { PasswordResetCodeEntity } from '@config/db/entities/user/password-reset-code.entity';
import * as bcryptjs from 'bcryptjs';
import { IsNull, MoreThan, QueryRunner, DataSource } from 'typeorm';
import { TEntityResponse } from '@config/db/meta/db.types';
import { UserRoleEntity } from '@config/db/entities/user/user_role.entity';
import { RoleEntity } from '@config/db/entities/user/role.entity';
import { FileEntity } from '@config/db/entities/user/file.entity';
import { FileTypeEntity } from '@config/db/entities/user/file_type.entity';
import { PROFILE_FILE_TYPE_NAME, PROFILE_FILE_TYPE_UUID } from '@config/db/const/file-type.const';
import { UserEntity } from '@config/db/entities/user/user.entity';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { UserOrganizationEntity } from '@config/db/entities/user/user_organization.entity';
import { OrganizationProducerInviteEntity } from '@config/db/entities/user/organization-producer-invite.entity';
import { ImageCompressionService } from '@root/shared/services/image-compression.service';
import { RegisterAuthRequest } from '@modules/auth/controllers/requests/register-auth.request';
import { resolveActiveRole } from '@root/shared/auth/utils/active-role';
import { PRODUCTOR_ROLE_UUID, ORGANIZATION_STATUS } from '@modules/organization/const/organization-fiscal.const';
import { PASSWORD_POLICY } from '@modules/organization/const/organization-staff.const';

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    protected readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly imageCompressionService: ImageCompressionService,
    private readonly dataSource: DataSource
  ) {}

  private readonly defaultRoleNames = ['Usuario', 'usuario', 'user', 'patient', 'clinic_admin'];
  /**
   * Rol asignado a quien se registra desde el sitio público (comprador).
   * Sembrado por la migración SeedClienteRole; `user_role` tiene FK contra
   * `role`, así que este UUID tiene que existir sí o sí.
   */
  private readonly roleUserUuid = 'd4f8a1c3-5b27-4e69-9a04-3c71e8b5d2f6';
  private readonly roleProductorUuid = PRODUCTOR_ROLE_UUID;
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

    // Si el email no está verificado igual puede entrar: el área cliente muestra un banner
    // para completar la verificación del correo de registro (emailVerified).

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
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES') || '12h'
    });
    return { access, refresh };
  }

  public refreshExpToDate(): Date {
    const exp = this.config.get('JWT_REFRESH_EXPIRES') || '12h';
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
          organization: { organizationStatus: true }
        }
      }
    });

    if (!reloadedUser) throw new UnauthorizedException('Usuario no encontrado después de la autenticación');

    const userWithRelations = reloadedUser as TEntityResponse<
      'user',
      {
        files: true;
        userTokenSessions: true;
        userRoles: { role: true };
        userOrganizations: { organization: { organizationStatus: true } };
      },
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

  /**
   * Renueva access + refresh con rotación de sesión en DB.
   * Access corto (15m) + refresh ~12h: patrón recomendado para SPA web.
   */
  async refreshTokens(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    let payload: { sub?: string; email?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET')
      });
    } catch {
      throw new UnauthorizedException('Sesión expirada. Volvé a iniciar sesión.');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const sessions = await this.dbRepository.findMany({
      entity: 'user_token_session',
      where: { userUuid: payload.sub, isDeleted: IsNull() }
    });

    let matched = false;
    for (const session of sessions) {
      if (await this.compare(refreshToken, session.refresh_token)) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      throw new UnauthorizedException('Sesión inválida o revocada');
    }

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: payload.sub, isDeleted: IsNull() },
      relations: {
        files: true,
        userTokenSessions: true,
        userRoles: { role: true }
      }
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario inactivo o no encontrado');
    }

    const { access, refresh } = await this.signTokens(user);
    await this.setRefresh(user.uuid, access, refresh);

    return { access_token: access, refresh_token: refresh };
  }

  async userLoginAuth(emailOrUsername: string, password: string): Promise<TLoginAuthResult> {
    const user = await this.authenticateUserByCredentials(emailOrUsername, password);

    if (user.twoAuthentication) {
      await this.issueTwoFactorCode(user.uuid, user.email, user.firstName || 'Usuario');
      return { requiresTwoFactor: true, email: user.email };
    }

    return this.buildLoginResponse(user);
  }

  async verifyTwoFactor(email: string, code: string): Promise<TUserLoginAuthResponse> {
    const normalizedEmail = email.trim();
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { email: normalizedEmail, isDeleted: IsNull() },
      relations: {
        files: true,
        userTokenSessions: true,
        userRoles: { role: true }
      }
    });

    if (!user || !user.active || !user.twoAuthentication) {
      throw new UnauthorizedException('Código inválido o expirado');
    }

    const session = await this.dbRepository.findOne({
      entity: 'user_session',
      where: {
        userUuid: user.uuid,
        code: code.trim(),
        isUsed: false,
        expiresAt: MoreThan(new Date())
      },
      other: { order: { createdAt: 'DESC' } }
    });

    if (!session) {
      throw new UnauthorizedException('Código inválido o expirado');
    }

    await this.dbRepository.update({
      entity: 'user_session',
      where: { uuid: session.uuid },
      data: { isUsed: true }
    });

    return this.buildLoginResponse(user);
  }

  async resendTwoFactor(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim();
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { email: normalizedEmail, isDeleted: IsNull() }
    });

    // Anti-enumeración: misma respuesta siempre
    const message = 'Si corresponde, te enviamos un nuevo código';

    if (user?.active && user.twoAuthentication) {
      await this.issueTwoFactorCode(user.uuid, user.email, user.firstName || 'Usuario');
    }

    return { message };
  }

  private generateSixDigitCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private async issueTwoFactorCode(userUuid: string, email: string, firstName: string): Promise<void> {
    // Invalidar códigos previos no usados
    const pending = await this.dbRepository.findMany({
      entity: 'user_session',
      where: { userUuid, isUsed: false }
    });
    for (const s of pending) {
      await this.dbRepository.update({
        entity: 'user_session',
        where: { uuid: s.uuid },
        data: { isUsed: true }
      });
    }

    const code = this.generateSixDigitCode();
    const session = new UserSessionEntity();
    session.uuid = uuidv4();
    session.userUuid = userUuid;
    session.code = code;
    session.isUsed = false;
    session.expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.dbRepository.create({ entity: 'user_session', data: session });

    try {
      await this.emailService.initializeSmtp();
      await this.emailService.sendLoginCodeEmail({ firstName, email, code });
      this.logger.log(`Código 2FA enviado a ${email}`);
    } catch (error) {
      this.logger.error(`No se pudo enviar código 2FA a ${email}: ${(error as Error).message}`);
      if (this.isLocalEnvironment()) {
        this.logger.warn(`[local] Código 2FA para ${email}: ${code}`);
      } else {
        throw new BadRequestException('No se pudo enviar el código de verificación. Intentá de nuevo.');
      }
    }
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

  async registerProducer(request: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    acceptedTerms: true;
  }): Promise<{ email: string; uuid: string; organizationUuid: string }> {
    const existing = await this.dbRepository.findOne({
      entity: 'user',
      where: { email: request.email, isDeleted: IsNull() }
    });
    if (existing) throw new BadRequestException('El email ya se encuentra registrado');

    const user = new UserEntity();
    user.uuid = uuidv4();
    user.firstName = request.firstName.trim();
    user.lastName = request.lastName.trim();
    user.email = request.email.trim();
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
    userRole.roleUuid = this.roleProductorUuid;
    userRole.createdBy = user.uuid;
    userRole.updatedBy = user.uuid;
    await this.dbRepository.create({ entity: 'user_role', data: userRole });

    const org = new OrganizationEntity();
    org.uuid = uuidv4();
    org.name = `Productora ${user.firstName} ${user.lastName}`.trim();
    org.active = 1;
    org.organizationStatusUuid = ORGANIZATION_STATUS.DRAFT_INCOMPLETE.uuid;
    org.isDeleted = null;
    org.createdBy = user.uuid;
    org.updatedBy = user.uuid;
    await this.dbRepository.create({ entity: 'organization', data: org });

    const membership = new UserOrganizationEntity();
    membership.uuid = uuidv4();
    membership.userUuid = user.uuid;
    membership.organizationUuid = org.uuid;
    membership.isDeleted = null;
    membership.createdBy = user.uuid;
    membership.updatedBy = user.uuid;
    await this.dbRepository.create({ entity: 'user_organization', data: membership });

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
      console.error('Failed to send producer registration email:', error);
    }

    return { email: request.email, uuid: user.uuid, organizationUuid: org.uuid };
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
    const normalizedEmail = email.trim();
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { email: normalizedEmail, isDeleted: IsNull() }
    });

    // Silencio deliberado si el correo no existe: responder distinto convertiría
    // este endpoint público en un oráculo para saber qué direcciones tienen
    // cuenta. El controller devuelve 200 con un mensaje neutro en ambos casos.
    if (!user) {
      this.logger.warn(`Reset de contraseña pedido para un correo inexistente: ${normalizedEmail}`);
      return;
    }

    await this.issuePasswordResetCode(user.email, user.firstName || user.username || 'Usuario');
  }

  private async issuePasswordResetCode(email: string, firstName: string): Promise<void> {
    const pending = await this.dbRepository.findMany({
      entity: 'user_password_reset',
      where: { email, isUsed: false }
    });
    for (const row of pending) {
      await this.dbRepository.update({
        entity: 'user_password_reset',
        where: { uuid: row.uuid },
        data: { isUsed: true }
      });
    }

    const code = this.generateSixDigitCode();
    const reset = new PasswordResetCodeEntity();
    reset.uuid = uuidv4();
    reset.code = code;
    reset.email = email;
    reset.isUsed = false;
    reset.expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.dbRepository.create({ entity: 'user_password_reset', data: reset });

    try {
      await this.emailService.initializeSmtp();
      await this.emailService.sendResetPasswordEmail({ firstName, email, code });
      this.logger.log(`Código de reset de contraseña enviado a ${email}`);
    } catch (error) {
      this.logger.error(`No se pudo enviar código de reset a ${email}: ${(error as Error).message}`);
      if (this.isLocalEnvironment()) {
        this.logger.warn(`[local] Código de reset para ${email}: ${code}`);
      } else {
        throw new BadRequestException('No se pudo enviar el código. Intentá de nuevo.');
      }
    }
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

  async resetPassword(email: string, password: string, code: string): Promise<void> {
    const normalizedEmail = email.trim();
    const reset = await this.dbRepository.findOne({
      entity: 'user_password_reset',
      where: {
        email: normalizedEmail,
        code: code.trim(),
        isUsed: false,
        expiresAt: MoreThan(new Date())
      },
      other: { order: { createdAt: 'DESC' } }
    });

    if (!reset) {
      throw new BadRequestException('Código inválido o expirado');
    }

    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { email: normalizedEmail, isDeleted: IsNull() }
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.dbRepository.update({
      entity: 'user',
      where: { uuid: user.uuid },
      data: { password: await this.hash(password), updatedBy: user.uuid }
    });

    await this.dbRepository.update({
      entity: 'user_password_reset',
      where: { uuid: reset.uuid },
      data: { isUsed: true }
    });
  }

  private async loadMeUser(userUuid: string): Promise<TMeResponse> {
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid, isDeleted: IsNull() },
      relations: {
        files: true,
        userRoles: { role: true },
        userOrganizations: { organization: { organizationStatus: true } }
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
      // La columna es `date`: se guarda el 'YYYY-MM-DD' tal cual, sin pasar por
      // Date. `new Date('2000-07-30')` se interpreta como medianoche UTC y el
      // driver la reescribe en hora local, restando un día al oeste de Greenwich.
      // Una fecha de nacimiento no tiene hora ni zona; convertirla le inventa una.
      const raw = data.birthday?.trim();
      userData.birthday = (raw ? raw.slice(0, 10) : null) as unknown as UserEntity['birthday'];
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

  async validateProducerInvite(token: string): Promise<{
    valid: boolean;
    emailMasked?: string;
    organizationName?: string;
    expiresAt?: string;
    message?: string;
  }> {
    const invite = await this.dbRepository.findOne({
      entity: 'organization_producer_invite',
      where: { token: token.trim(), isUsed: false },
      relations: { organization: true } as any
    });

    if (!invite) {
      return { valid: false, message: 'Invitación inválida o ya utilizada.' };
    }

    const row = invite as OrganizationProducerInviteEntity;
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      return { valid: false, message: 'La invitación expiró. Pedí una nueva al Productor.' };
    }

    const org = row.organization as OrganizationEntity | undefined;

    return {
      valid: true,
      emailMasked: this.maskEmail(row.email),
      organizationName: org?.name ?? 'Productora',
      expiresAt: new Date(row.expiresAt).toISOString()
    };
  }

  async acceptProducerInvite(request: {
    token: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<{ message: string; email: string }> {
    if (!PASSWORD_POLICY.test(request.password)) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres, con letras, números y un carácter especial.'
      );
    }

    const invite = await this.dbRepository.findOne({
      entity: 'organization_producer_invite',
      where: { token: request.token.trim(), isUsed: false }
    });

    if (!invite) {
      throw new BadRequestException('Invitación inválida o ya utilizada.');
    }

    const row = invite as OrganizationProducerInviteEntity;
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      throw new BadRequestException('La invitación expiró. Pedí una nueva al Productor.');
    }

    const email = row.email.trim().toLowerCase();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let user = await queryRunner.manager.findOne(UserEntity, {
        where: { email, isDeleted: IsNull() }
      });

      if (!user) {
        user = new UserEntity();
        user.uuid = uuidv4();
        user.firstName = (request.firstName?.trim() || email.split('@')[0] || 'Productor').slice(0, 255);
        user.lastName = (request.lastName?.trim() || 'Invitado').slice(0, 255);
        user.email = email;
        user.password = await this.hash(request.password);
        user.active = 1;
        user.emailVerified = true;
        user.emailVerifiedAt = new Date();
        user.twoAuthentication = false;
        user.termsAcceptedAt = new Date();
        user.isDeleted = null;
        await queryRunner.manager.save(UserEntity, user);
      } else {
        user.password = await this.hash(request.password);
        if (request.firstName?.trim()) user.firstName = request.firstName.trim();
        if (request.lastName?.trim()) user.lastName = request.lastName.trim();
        user.emailVerified = true;
        user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
        user.twoAuthentication = false;
        await queryRunner.manager.save(UserEntity, user);
      }

      const existingRole = await queryRunner.manager.findOne(UserRoleEntity, {
        where: { userUuid: user.uuid, roleUuid: this.roleProductorUuid }
      });

      if (!existingRole) {
        const userRole = new UserRoleEntity();
        userRole.uuid = uuidv4();
        userRole.userUuid = user.uuid;
        userRole.roleUuid = this.roleProductorUuid;
        userRole.createdBy = row.invitedByUuid;
        await queryRunner.manager.save(UserRoleEntity, userRole);
      } else if (existingRole.isDeleted) {
        await queryRunner.manager.update(
          UserRoleEntity,
          { uuid: existingRole.uuid },
          { isDeleted: null, updatedBy: row.invitedByUuid }
        );
      }

      const membership = await queryRunner.manager.findOne(UserOrganizationEntity, {
        where: { userUuid: user.uuid, organizationUuid: row.organizationUuid }
      });

      if (!membership) {
        const link = new UserOrganizationEntity();
        link.uuid = uuidv4();
        link.userUuid = user.uuid;
        link.organizationUuid = row.organizationUuid;
        link.isDeleted = null;
        link.createdBy = row.invitedByUuid;
        await queryRunner.manager.save(UserOrganizationEntity, link);
      } else if (membership.isDeleted) {
        await queryRunner.manager.update(
          UserOrganizationEntity,
          { uuid: membership.uuid },
          { isDeleted: null, updatedBy: row.invitedByUuid }
        );
      }

      await queryRunner.manager.update(
        OrganizationProducerInviteEntity,
        { uuid: row.uuid },
        { isUsed: true, acceptedAt: new Date() }
      );

      await queryRunner.commitTransaction();

      return {
        message: 'Invitación aceptada. Ya podés iniciar sesión.',
        email
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${local.length > 2 ? '***' : ''}@${domain}`;
  }
}
