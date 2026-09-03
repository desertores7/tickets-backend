import { DBRepository } from '@config/db/db.repository';
import { UserEntity } from '@config/db/entities/user/user.entity';
import { UserOrganizationEntity } from '@config/db/entities/user/user_organization.entity';
import { UserRoleEntity } from '@config/db/entities/user/user_role.entity';
import { OrganizationEntity } from '@config/db/entities/user/organization.entity';
import { OrganizationProducerInviteEntity } from '@config/db/entities/user/organization-producer-invite.entity';
import { UserEventCashierEntity } from '@config/db/entities/tickets/user_event_cashier.entity';
import { EventEntity } from '@config/db/entities/tickets/event.entity';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { DataSource, In, IsNull, MoreThan } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcryptjs from 'bcryptjs';
import { EmailService } from '@root/shared/auth/services/email.service';
import { EnvService } from '@config/env/env.service';
import { organizationStatusName } from '@modules/organization/const/organization-fiscal.const';
import {
  CAJA_ROLE_UUID,
  CREATE_STAFF_ROLES,
  PASSWORD_POLICY,
  PRODUCER_INVITE_TTL_DAYS,
  PRODUCTOR_ROLE_UUID,
  STAFF_ROLE_NAMES,
  type CreateStaffRole,
  type StaffKind
} from '@modules/organization/const/organization-staff.const';
import { CreateStaffRequest } from '../../controllers/dtos/organization-staff/create-staff.request';
import { UpdateStaffRequest } from '../../controllers/dtos/organization-staff/update-staff.request';
import {
  StaffAssignedEventResponse,
  StaffMemberResponse
} from '../../controllers/dtos/organization-staff/staff-member.response';
import { resolveActiveRole } from '@root/shared/auth/utils/active-role';

type UserWithRoles = UserEntity & {
  userRoles?: { isDeleted?: Date | null; role?: { uuid: string; name: string } | null }[];
};

@Injectable()
export class OrganizationStaffService {
  private readonly logger = new Logger(OrganizationStaffService.name);

  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly envService: EnvService
  ) {}

  async listStaff(callerUuid: string): Promise<StaffMemberResponse[]> {
    const org = await this.assertProducerContext(callerUuid);
    const items: StaffMemberResponse[] = [];

    const memberships = await this.dbRepository.findMany({
      entity: 'user_organization',
      where: { organizationUuid: org.uuid, isDeleted: IsNull() },
      relations: { user: { userRoles: { role: true } } } as any
    });

    for (const membership of memberships as any[]) {
      const user = membership.user as UserWithRoles | undefined;
      if (!user || user.isDeleted) continue;

      // El productor logueado gestiona al resto del equipo; no se lista a sí mismo.
      if (user.uuid === callerUuid) continue;

      const staffKind = this.resolveStaffKind(user);
      if (!staffKind || staffKind === 'producer_invite_pending') continue;

      const assignedEvents =
        staffKind === 'cashier' ? await this.loadCashierEvents(user.uuid, org.uuid) : [];

      items.push(
        new StaffMemberResponse({
          staffKind,
          userUuid: user.uuid,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          active: Boolean(user.active),
          createdAt: membership.createdAt ?? user.createdAt,
          assignedEvents
        })
      );
    }

    const pendingInvites = await this.dbRepository.findMany({
      entity: 'organization_producer_invite',
      where: {
        organizationUuid: org.uuid,
        isUsed: false,
        expiresAt: MoreThan(new Date())
      } as any
    });

    for (const invite of pendingInvites as OrganizationProducerInviteEntity[]) {
      items.push(
        new StaffMemberResponse({
          staffKind: 'producer_invite_pending',
          inviteUuid: invite.uuid,
          email: invite.email,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          active: null
        })
      );
    }

    items.sort((a, b) => a.email.localeCompare(b.email, 'es'));
    return items;
  }

  async createStaff(callerUuid: string, data: CreateStaffRequest): Promise<StaffMemberResponse> {
    const org = await this.assertProducerContext(callerUuid);

    if (!PASSWORD_POLICY.test(data.password)) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres, con letras, números y un carácter especial.'
      );
    }

    if (data.role === 'cashier') {
      if (!data.eventUuids?.length) {
        throw new BadRequestException('Debés asignar al menos un evento para el rol Caja.');
      }
      await this.assertEventsBelongToOrg(data.eventUuids, org.uuid);
    }

    const email = data.email.trim().toLowerCase();
    const roleUuid = data.role === 'validator' ? this.roleUuidFor('Validador') : this.roleUuidFor('Caja');
    const staffKind: StaffKind = data.role === 'validator' ? 'validator' : 'cashier';

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let user = await queryRunner.manager.findOne(UserEntity, {
        where: { email, isDeleted: IsNull() }
      });

      if (user) {
        await this.assertUserCanJoinOrgStaff(user.uuid, org.uuid, staffKind);
      } else {
        user = new UserEntity();
        user.uuid = uuidv4();
        user.firstName = (data.firstName?.trim() || email.split('@')[0] || 'Usuario').slice(0, 255);
        user.lastName = (data.lastName?.trim() || 'Staff').slice(0, 255);
        user.email = email;
        user.password = await bcryptjs.hash(data.password, 10);
        user.active = 1;
        user.emailVerified = true;
        user.emailVerifiedAt = new Date();
        user.twoAuthentication = false;
        user.isDeleted = null;
        user.createdBy = callerUuid;
        await queryRunner.manager.save(UserEntity, user);
      }

      await this.ensureOrgMembership(user.uuid, org.uuid, callerUuid, queryRunner);
      await this.grantRoleIfMissing(user.uuid, roleUuid, callerUuid, queryRunner);

      if (data.role === 'cashier') {
        await this.syncCashierEvents(user.uuid, org.uuid, data.eventUuids!, callerUuid, queryRunner);
      }

      await queryRunner.commitTransaction();

      const assignedEvents =
        staffKind === 'cashier' ? await this.loadCashierEvents(user.uuid, org.uuid) : [];

      return new StaffMemberResponse({
        staffKind,
        userUuid: user.uuid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        active: Boolean(user.active),
        createdAt: new Date(),
        assignedEvents
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async inviteProducer(callerUuid: string, emailRaw: string): Promise<StaffMemberResponse> {
    const org = await this.assertProducerContext(callerUuid);
    const email = emailRaw.trim().toLowerCase();

    const existingUser = await this.dbRepository.findOne({
      entity: 'user',
      where: { email, isDeleted: IsNull() },
      relations: { userRoles: { role: true }, userOrganizations: true } as any
    });

    if (existingUser) {
      const roles = (existingUser as UserWithRoles).userRoles ?? [];
      const activeRoleNames = roles
        .filter(r => !r.isDeleted && r.role?.name)
        .map(r => r.role!.name);

      if (activeRoleNames.includes(STAFF_ROLE_NAMES.Productor)) {
        const memberships = (existingUser as any).userOrganizations ?? [];
        const inThisOrg = memberships.some(
          (m: { organizationUuid: string; isDeleted: Date | null }) =>
            m.organizationUuid === org.uuid && !m.isDeleted
        );
        if (inThisOrg) {
          throw new ConflictException('Ese email ya es Productor de esta productora.');
        }
        throw new ConflictException(
          'Ese email ya pertenece a otra productora. Usá otro email para la invitación.'
        );
      }

      if (activeRoleNames.includes('Administrador')) {
        throw new ConflictException('No se puede invitar a un administrador del sistema.');
      }
    }

    const pending = await this.dbRepository.findOne({
      entity: 'organization_producer_invite',
      where: {
        organizationUuid: org.uuid,
        email,
        isUsed: false,
        expiresAt: MoreThan(new Date())
      } as any
    });

    if (pending) {
      throw new ConflictException('Ya hay una invitación pendiente para ese email.');
    }

    const invite = new OrganizationProducerInviteEntity();
    invite.uuid = uuidv4();
    invite.email = email;
    invite.organizationUuid = org.uuid;
    invite.token = uuidv4();
    invite.invitedByUuid = callerUuid;
    invite.expiresAt = new Date(Date.now() + PRODUCER_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    invite.isUsed = false;

    await this.dbRepository.create({ entity: 'organization_producer_invite', data: invite });

    const inviteUrl = `${this.getFrontendUrl()}/invite?token=${encodeURIComponent(invite.token)}`;

    try {
      await this.emailService.initializeSmtp();
      await this.emailService.sendProducerInviteEmail({
        email,
        organizationName: org.name,
        inviteUrl
      });
    } catch (error) {
      this.logger.error('Failed to send producer invite email', error);
    }

    return new StaffMemberResponse({
      staffKind: 'producer_invite_pending',
      inviteUuid: invite.uuid,
      email: invite.email,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      active: null
    });
  }

  async updateStaff(
    callerUuid: string,
    targetUserUuid: string,
    data: UpdateStaffRequest
  ): Promise<StaffMemberResponse> {
    const org = await this.assertProducerContext(callerUuid);

    if (targetUserUuid === callerUuid) {
      throw new BadRequestException('No podés modificar tu propia cuenta desde Usuarios.');
    }

    if (org.createdBy && targetUserUuid === org.createdBy) {
      throw new BadRequestException('No se puede modificar al productor titular de la organización.');
    }

    const user = await this.getStaffUserInOrg(targetUserUuid, org.uuid);
    const staffKind = this.resolveStaffKind(user);
    if (!staffKind || staffKind === 'producer_invite_pending') {
      throw new NotFoundException('Usuario de staff no encontrado');
    }

    if (data.active !== undefined) {
      await this.dbRepository.update({
        entity: 'user',
        where: { uuid: targetUserUuid },
        data: { active: data.active ? 1 : 0, updatedBy: callerUuid }
      });
    }

    if (staffKind === 'cashier') {
      if (data.eventUuids) {
        if (!data.eventUuids.length) {
          throw new BadRequestException('Debés asignar al menos un evento.');
        }
        await this.assertEventsBelongToOrg(data.eventUuids, org.uuid);
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
          await this.syncCashierEvents(targetUserUuid, org.uuid, data.eventUuids, callerUuid, queryRunner);
          await queryRunner.commitTransaction();
        } catch (e) {
          await queryRunner.rollbackTransaction();
          throw e;
        } finally {
          await queryRunner.release();
        }
      }

      if (data.eventAssignments?.length) {
        for (const assignment of data.eventAssignments) {
          await this.dbRepository.update({
            entity: 'user_event_cashier',
            where: {
              userUuid: targetUserUuid,
              eventUuid: assignment.eventUuid,
              organizationUuid: org.uuid,
              isDeleted: IsNull()
            } as any,
            data: { isHidden: assignment.isHidden }
          });
        }
      }
    }

    const refreshed = await this.getStaffUserInOrg(targetUserUuid, org.uuid);
    const assignedEvents =
      staffKind === 'cashier' ? await this.loadCashierEvents(targetUserUuid, org.uuid) : [];

    return new StaffMemberResponse({
      staffKind,
      userUuid: refreshed.uuid,
      email: refreshed.email,
      firstName: refreshed.firstName,
      lastName: refreshed.lastName,
      active: Boolean(refreshed.active),
      createdAt: refreshed.createdAt,
      assignedEvents
    });
  }

  async cancelInvite(callerUuid: string, inviteUuid: string): Promise<void> {
    const org = await this.assertProducerContext(callerUuid);

    const invite = await this.dbRepository.findOne({
      entity: 'organization_producer_invite',
      where: {
        uuid: inviteUuid,
        organizationUuid: org.uuid,
        isUsed: false
      } as any
    });

    if (!invite) {
      throw new NotFoundException('Invitación no encontrada o ya utilizada.');
    }

    // Marcar usada invalida el token en /invite sin crear usuario.
    await this.dbRepository.update({
      entity: 'organization_producer_invite',
      where: { uuid: inviteUuid },
      data: { isUsed: true }
    });
  }

  async removeStaff(callerUuid: string, targetUserUuid: string): Promise<void> {
    const org = await this.assertProducerContext(callerUuid);

    if (targetUserUuid === callerUuid) {
      throw new BadRequestException('No podés eliminarte a vos mismo del equipo.');
    }

    if (org.createdBy && targetUserUuid === org.createdBy) {
      throw new BadRequestException('No se puede quitar al productor titular de la organización.');
    }

    const user = await this.getStaffUserInOrg(targetUserUuid, org.uuid);
    const staffKind = this.resolveStaffKind(user);
    if (!staffKind || staffKind === 'producer_invite_pending') {
      throw new NotFoundException('Usuario de staff no encontrado');
    }

    await this.dbRepository.update({
      entity: 'user_organization',
      where: { userUuid: targetUserUuid, organizationUuid: org.uuid, isDeleted: IsNull() },
      data: { isDeleted: new Date(), updatedBy: callerUuid }
    });

    if (staffKind === 'cashier') {
      await this.dbRepository.update({
        entity: 'user_event_cashier',
        where: { userUuid: targetUserUuid, organizationUuid: org.uuid, isDeleted: IsNull() } as any,
        data: { isDeleted: new Date() }
      });
    }
  }

  private async assertProducerContext(callerUuid: string): Promise<OrganizationEntity> {
    const membership = (await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { userUuid: callerUuid, isDeleted: IsNull() },
      relations: { organization: { organizationStatus: true } } as any
    })) as any;

    if (!membership?.organization || membership.organization.isDeleted) {
      throw new NotFoundException('No tenés una productora asociada');
    }

    const org = membership.organization as OrganizationEntity;
    if (organizationStatusName(org) !== 'approved') {
      throw new ForbiddenException(
        'La productora debe estar aprobada para gestionar usuarios del equipo.'
      );
    }

    const caller = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: callerUuid, isDeleted: IsNull() },
      relations: { userRoles: { role: true } } as any
    });

    const activeRole = resolveActiveRole((caller as UserWithRoles)?.userRoles);
    if (activeRole?.name !== STAFF_ROLE_NAMES.Productor) {
      throw new ForbiddenException('Solo un Productor puede gestionar usuarios del equipo.');
    }

    return org;
  }

  private resolveStaffKind(user: UserWithRoles): StaffKind | null {
    const roleNames = (user.userRoles ?? [])
      .filter(r => !r.isDeleted && r.role?.name)
      .map(r => r.role!.name);

    if (roleNames.includes(STAFF_ROLE_NAMES.Productor)) return 'producer';
    if (roleNames.includes(STAFF_ROLE_NAMES.Caja)) return 'cashier';
    if (roleNames.includes(STAFF_ROLE_NAMES.Validador)) return 'validator';
    return null;
  }

  private roleUuidFor(name: string): string {
    if (name === STAFF_ROLE_NAMES.Productor) return PRODUCTOR_ROLE_UUID;
    if (name === STAFF_ROLE_NAMES.Validador) return '3e7a1c52-88f4-4b0d-a9e6-51c2d47b9a03';
    if (name === STAFF_ROLE_NAMES.Caja) return CAJA_ROLE_UUID;
    throw new BadRequestException(`Rol desconocido: ${name}`);
  }

  private async getStaffUserInOrg(userUuid: string, orgUuid: string): Promise<UserWithRoles> {
    const membership = (await this.dbRepository.findOne({
      entity: 'user_organization',
      where: { userUuid, organizationUuid: orgUuid, isDeleted: IsNull() },
      relations: { user: { userRoles: { role: true } } } as any
    })) as any;

    if (!membership?.user) {
      throw new NotFoundException('Usuario no encontrado en esta productora');
    }

    return membership.user as UserWithRoles;
  }

  private async assertEventsBelongToOrg(eventUuids: string[], orgUuid: string): Promise<void> {
    const events = await this.dbRepository.findMany({
      entity: 'event',
      where: { uuid: In(eventUuids), organizationUuid: orgUuid } as any
    });

    if (events.length !== eventUuids.length) {
      throw new BadRequestException('Uno o más eventos no pertenecen a tu productora.');
    }
  }

  private async assertUserCanJoinOrgStaff(
    userUuid: string,
    orgUuid: string,
    incomingKind: StaffKind
  ): Promise<void> {
    const user = await this.dbRepository.findOne({
      entity: 'user',
      where: { uuid: userUuid, isDeleted: IsNull() },
      relations: { userRoles: { role: true }, userOrganizations: true } as any
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    const roleNames = ((user as UserWithRoles).userRoles ?? [])
      .filter(r => !r.isDeleted && r.role?.name)
      .map(r => r.role!.name);

    if (roleNames.includes('Administrador')) {
      throw new ConflictException('No se puede asignar un administrador del sistema.');
    }

    if (roleNames.includes(STAFF_ROLE_NAMES.Productor)) {
      const inOrg = ((user as any).userOrganizations ?? []).some(
        (m: { organizationUuid: string; isDeleted: Date | null }) =>
          m.organizationUuid === orgUuid && !m.isDeleted
      );
      if (!inOrg) {
        throw new ConflictException('Ese email ya es Productor de otra productora.');
      }
    }

    const memberships = ((user as any).userOrganizations ?? []).filter(
      (m: { isDeleted: Date | null }) => !m.isDeleted
    );
    const inThisOrg = memberships.some(
      (m: { organizationUuid: string }) => m.organizationUuid === orgUuid
    );
    const inOtherOrg = memberships.some(
      (m: { organizationUuid: string }) => m.organizationUuid !== orgUuid
    );

    if (inOtherOrg && !inThisOrg) {
      throw new ConflictException('Ese email ya pertenece a otra productora.');
    }

    if (inThisOrg) {
      const existingKind = this.resolveStaffKind(user as UserWithRoles);
      if (existingKind === incomingKind) {
        throw new ConflictException('Ese usuario ya tiene ese rol en la productora.');
      }
      if (existingKind === 'producer') {
        throw new ConflictException('Ese email ya es Productor de esta productora.');
      }
    }
  }

  private async ensureOrgMembership(
    userUuid: string,
    orgUuid: string,
    createdBy: string,
    queryRunner: import('typeorm').QueryRunner
  ): Promise<void> {
    const existing = await queryRunner.manager.findOne(UserOrganizationEntity, {
      where: { userUuid, organizationUuid: orgUuid }
    });

    if (!existing) {
      const membership = new UserOrganizationEntity();
      membership.uuid = uuidv4();
      membership.userUuid = userUuid;
      membership.organizationUuid = orgUuid;
      membership.isDeleted = null;
      membership.createdBy = createdBy;
      await queryRunner.manager.save(UserOrganizationEntity, membership);
    } else if (existing.isDeleted) {
      await queryRunner.manager.update(
        UserOrganizationEntity,
        { uuid: existing.uuid },
        { isDeleted: null, updatedBy: createdBy }
      );
    }
  }

  private async grantRoleIfMissing(
    userUuid: string,
    roleUuid: string,
    assignedBy: string,
    queryRunner: import('typeorm').QueryRunner
  ): Promise<void> {
    const existing = await queryRunner.manager.findOne(UserRoleEntity, {
      where: { userUuid, roleUuid }
    });

    if (!existing) {
      const link = new UserRoleEntity();
      link.uuid = uuidv4();
      link.userUuid = userUuid;
      link.roleUuid = roleUuid;
      link.createdBy = assignedBy;
      await queryRunner.manager.save(UserRoleEntity, link);
    } else if (existing.isDeleted) {
      await queryRunner.manager.update(
        UserRoleEntity,
        { uuid: existing.uuid },
        { isDeleted: null, updatedBy: assignedBy }
      );
    }
  }

  private async syncCashierEvents(
    userUuid: string,
    orgUuid: string,
    eventUuids: string[],
    createdBy: string,
    queryRunner: import('typeorm').QueryRunner
  ): Promise<void> {
    const existing = await queryRunner.manager.find(UserEventCashierEntity, {
      where: { userUuid, organizationUuid: orgUuid, isDeleted: IsNull() }
    });

    const desired = new Set(eventUuids);
    const existingActive = existing.filter(e => !e.isDeleted);

    for (const row of existingActive) {
      if (!desired.has(row.eventUuid)) {
        await queryRunner.manager.update(
          UserEventCashierEntity,
          { uuid: row.uuid },
          { isDeleted: new Date() }
        );
      }
    }

    for (const eventUuid of eventUuids) {
      const found = existing.find(e => e.eventUuid === eventUuid);
      if (found) {
        if (found.isDeleted) {
          await queryRunner.manager.update(
            UserEventCashierEntity,
            { uuid: found.uuid },
            { isDeleted: null, isHidden: false }
          );
        }
      } else {
        const row = new UserEventCashierEntity();
        row.uuid = uuidv4();
        row.userUuid = userUuid;
        row.eventUuid = eventUuid;
        row.organizationUuid = orgUuid;
        row.isHidden = false;
        row.isDeleted = null;
        row.createdBy = createdBy;
        await queryRunner.manager.save(UserEventCashierEntity, row);
      }
    }
  }

  private async loadCashierEvents(
    userUuid: string,
    orgUuid: string
  ): Promise<StaffAssignedEventResponse[]> {
    const rows = await this.dbRepository.findMany({
      entity: 'user_event_cashier',
      where: { userUuid, organizationUuid: orgUuid, isDeleted: IsNull() } as any,
      relations: { event: true } as any
    });

    return (rows as UserEventCashierEntity[])
      .filter(r => r.event)
      .map(
        r =>
          new StaffAssignedEventResponse({
            uuid: r.eventUuid,
            name: (r.event as EventEntity).name,
            isHidden: r.isHidden
          })
      );
  }

  private getFrontendUrl(): string {
    return (
      this.envService.get('FRONTEND_URL') ||
      this.envService.get('APP_URL') ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }
}
