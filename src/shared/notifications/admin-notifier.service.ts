import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IUserNotificationService } from '@modules/notifications/services/contracts/iuser-notification.service';
import { EmailService } from '@root/shared/auth/services/email.service';

export type AdminNotifyEmailOptions = {
  /** Ruta del front (ej. `/admin/organizations?fiscalChangePending=true`). */
  actionPath: string;
  actionLabel: string;
};

type ActiveAdmin = {
  userUuid: string;
  email: string | null;
  firstName: string | null;
};

/**
 * Avisos in-app (y opcionales por email) para el equipo interno de la ticketera.
 *
 * Existe como servicio propio porque hay más de un módulo que necesita
 * levantarle la mano al Admin —productoras esperando validación, reembolsos
 * que Mercado Pago rechazó— y la consulta de a quién avisar no es obvia.
 */
@Injectable()
export class AdminNotifierService {
  private readonly logger = new Logger(AdminNotifierService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject('IUserNotificationService')
    private readonly userNotificationService: IUserNotificationService,
    private readonly emailService: EmailService
  ) {}

  /**
   * Notifica a todos los administradores activos.
   *
   * Los busca por **nombre** de rol y no por uuid a propósito: los uuid de los
   * seeds no coinciden entre entornos —el índice único por nombre hace que el
   * `ON DUPLICATE KEY UPDATE` matchee por nombre—, así que un uuid fijo
   * funcionaría en local y en producción no notificaría a nadie.
   *
   * Nunca lanza: es un aviso. Si falla, el hecho que lo motivó ya quedó
   * guardado en la base y el Admin lo va a ver igual al entrar a la pantalla.
   */
  async notifyAdmins(
    title: string,
    body: string,
    options?: { email?: AdminNotifyEmailOptions }
  ): Promise<void> {
    try {
      const admins = await this.findActiveAdmins();

      if (!admins.length) {
        this.logger.warn(`No hay administradores activos para notificar: ${title}`);
        return;
      }

      // Una notificación falla sin arrastrar a las demás: que un admin quede
      // sin aviso no puede impedir que el resto se entere.
      await Promise.allSettled(
        admins.map(a => this.userNotificationService.create(a.userUuid, title, body))
      );

      if (options?.email) {
        await this.emailAdmins(admins, title, body, options.email);
      }
    } catch (error) {
      this.logger.error(
        `No se pudo notificar a los administradores: ${title}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  private async findActiveAdmins(): Promise<ActiveAdmin[]> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('u.uuid', 'userUuid')
      .addSelect('u.email', 'email')
      .addSelect('u.firstName', 'firstName')
      .from('user_role', 'ur')
      .innerJoin('role', 'r', 'r.uuid = ur.roleUuid')
      .innerJoin('user', 'u', 'u.uuid = ur.userUuid')
      .where('r.name = :roleName', { roleName: 'Administrador' })
      .andWhere('ur.isDeleted IS NULL')
      .andWhere('u.isDeleted IS NULL')
      .groupBy('u.uuid')
      .addGroupBy('u.email')
      .addGroupBy('u.firstName')
      .getRawMany<{ userUuid: string; email: string | null; firstName: string | null }>();

    return rows;
  }

  private async emailAdmins(
    admins: ActiveAdmin[],
    title: string,
    body: string,
    emailOpts: AdminNotifyEmailOptions
  ): Promise<void> {
    const withEmail = admins.filter(a => Boolean(a.email?.trim()));
    if (!withEmail.length) {
      this.logger.warn(`Admins sin email para avisar por correo: ${title}`);
      return;
    }

    await Promise.allSettled(
      withEmail.map(async admin => {
        try {
          await this.emailService.sendAdminAlertEmail({
            firstName: admin.firstName?.trim() || 'Admin',
            email: admin.email!.trim(),
            title,
            body,
            actionPath: emailOpts.actionPath,
            actionLabel: emailOpts.actionLabel
          });
        } catch (error) {
          this.logger.error(
            `No se pudo enviar email admin a ${admin.email}: ${title}`,
            error instanceof Error ? error.stack : String(error)
          );
        }
      })
    );
  }
}
