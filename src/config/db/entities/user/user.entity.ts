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

const tableName = 'user' as const;
@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  dni: string | null;

  @Column({ name: 'firstName', type: 'varchar', length: 255 })
  firstName: string;

  @Column({ name: 'lastName', type: 'varchar', length: 255 })
  lastName: string;

  @Column({ type: 'varchar', length: 50 })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  phone: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: null })
  gender: string | null;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'date', nullable: true, default: null })
  birthday: Date | null;

  @Column()
  active: number;

  @Column({ name: 'emailVerified', type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ name: 'emailVerifiedAt', type: 'timestamp', nullable: true, default: null })
  emailVerifiedAt: Date | null;

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
}

export const UserEntityData = {
  name: tableName,
  entity: UserEntity
} as const;