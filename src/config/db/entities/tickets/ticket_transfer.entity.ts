import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { TicketEntity } from './ticket.entity';

export enum TicketTransferStatus {
  /** Esperando que el destinatario acepte */
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  /** Cancelada por quien la envió, antes de ser aceptada */
  CANCELLED = 'cancelled'
}

const tableName = 'ticket_transfer' as const;

/**
 * Transferencia de una entrada a otro usuario, con confirmación.
 *
 * Se crea en estado `pending` apuntando a un email. El destinatario necesita
 * una cuenta con ese email para poder aceptarla; al aceptar, la titularidad
 * del ticket pasa a él y se regenera el QR (el código anterior deja de servir).
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class TicketTransferEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char', length: 36 })
  ticketUuid: string;

  @Column({ type: 'char', length: 36 })
  fromUserUuid: string;

  /** Email destino, normalizado a minúsculas */
  @Column({ type: 'varchar', length: 255 })
  toEmail: string;

  /** Se completa al aceptar, con el usuario que confirmó */
  @Column({ type: 'char', length: 36, nullable: true, default: null })
  toUserUuid: string | null;

  @Column({ type: 'enum', enum: TicketTransferStatus, default: TicketTransferStatus.PENDING })
  status: TicketTransferStatus;

  @Column({ type: 'varchar', length: 280, nullable: true, default: null })
  message: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  respondedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => TicketEntity)
  @JoinColumn({ name: 'ticketUuid', referencedColumnName: 'uuid' })
  ticket: TicketEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'fromUserUuid', referencedColumnName: 'uuid' })
  fromUser: UserEntity;
}

export const TicketTransferEntityData = {
  name: tableName,
  entity: TicketTransferEntity
} as const;
