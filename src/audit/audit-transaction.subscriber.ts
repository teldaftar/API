import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  TransactionStartEvent,
} from 'typeorm';
import { auditContext } from './audit-context';

/**
 * Hands the request's actor to the `audit_row_change` trigger. The settings are
 * transaction-local, so they cannot leak to another request on a pooled
 * connection. A write outside a transaction would be logged without an actor;
 * `save()` and `softRemove()` open their own transaction, so they are covered.
 */
@Injectable()
@EventSubscriber()
export class AuditTransactionSubscriber implements EntitySubscriberInterface {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  async afterTransactionStart(event: TransactionStartEvent): Promise<void> {
    const store = auditContext.getStore();
    if (!store) return;
    await event.queryRunner.query(
      `SELECT set_config('audit.actor_id', $1, true), set_config('audit.request_id', $2, true)`,
      [store.actorId ?? '', store.requestId ?? ''],
    );
  }
}
