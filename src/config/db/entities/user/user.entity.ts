import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { FileEntity } from './file.entity';
import { UserRoleEntity } from './user_role.entity';
import { UserTokenSessionEntity } from './user_token_session.entity';
import { UserOrganizationEntity } from './user_organization.entity';
import { PasswordResetCodeEntity } from './password-reset-code.entity';
import { UserSessionEntity } from './user_session.entity';
import { UserNotificationEntity } from './user_notification.entity';

const tableName = 'user' as const;
@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  dni: string | null;

  @Column({
    name: 'documentType',
    type: 'enum',
    enum: ['DNI', 'Pasaporte', 'Documento extranjero', 'Otro'],
    nullable: true,
    default: null
  })
  documentType: 'DNI' | 'Pasaporte' | 'Documento extranjero' | 'Otro' | null;

  @Column({ name: 'firstName', type: 'varchar', length: 255 })
  firstName: string;

  @Column({ name: 'lastName', type: 'varchar', length: 255 })
  lastName: string;

  @Column({ type: 'varchar', length: 50 })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  gender: string | null;

  @Column({
    name: 'billingIdType',
    type: 'enum',
    enum: ['DNI', 'CUIT/CUIL'],
    nullable: true,
    default: null
  })
  billingIdType: 'DNI' | 'CUIT/CUIL' | null;

  @Column({ name: 'billingIdNumber', type: 'varchar', length: 30, nullable: true, default: null })
  billingIdNumber: string | null;

  @Column({ name: 'billingLegalName', type: 'varchar', length: 255, nullable: true, default: null })
  billingLegalName: string | null;

  @Column({
    name: 'billingVatCondition',
    type: 'enum',
    enum: ['Consumidor final', 'Monotributo', 'Responsable inscripto', 'Exento'],
    nullable: true,
    default: null
  })
  billingVatCondition: 'Consumidor final' | 'Monotributo' | 'Responsable inscripto' | 'Exento' | null;

  @Column({ name: 'billingFiscalAddress', type: 'varchar', length: 255, nullable: true, default: null })
  billingFiscalAddress: string | null;

  @Column({ name: 'billingEmail', type: 'varchar', length: 100, nullable: true, default: null })
  billingEmail: string | null;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ name: 'googleId', type: 'varchar', length: 255, nullable: true, default: null })
  googleId: string | null;

  @Column({ type: 'date', nullable: true, default: null })
  birthday: Date | null;

  @Column()
  active: number;

  @Column({ name: 'emailVerified', type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ name: 'emailVerifiedAt', type: 'timestamp', nullable: true, default: null })
  emailVerifiedAt: Date | null;

  @Column({ name: 'termsAcceptedAt', type: 'timestamp', precision: 3, nullable: true, default: null })
  termsAcceptedAt: Date | null;

  @Column({ name: 'twoAuthentication', type: 'boolean', default: false })
  twoAuthentication: boolean;

  @Column({ type: 'date', nullable: true, default: null })
  isDeleted: Date | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  updatedBy: string | null;

  //Relations
  @OneToMany(() => FileEntity, file => file.user)
  files: FileEntity[];

  @OneToMany(() => UserRoleEntity, userRole => userRole.user)
  userRoles: UserRoleEntity[];

  @OneToMany(() => UserTokenSessionEntity, userTokenSession => userTokenSession.user)
  userTokenSessions?: UserTokenSessionEntity[];

  @OneToMany(() => PasswordResetCodeEntity, passwordResetCode => passwordResetCode.user)
  userPasswordReset: PasswordResetCodeEntity[];

  @OneToMany(() => UserOrganizationEntity, userOrganization => userOrganization.user)
  userOrganizations: UserOrganizationEntity[];

  @OneToMany(() => UserSessionEntity, userSession => userSession.user)
  userSessions: UserSessionEntity[];

  @OneToMany(() => UserNotificationEntity, notification => notification.user)
  notifications: UserNotificationEntity[];
}

export const UserEntityData = {
  name: tableName,
  entity: UserEntity
} as const;