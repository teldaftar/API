import { AsyncLocalStorage } from 'async_hooks';

export interface AuditContext {
  actorId?: string;
  requestId?: string;
}

/** Who is behind the current HTTP request, for `audit_log` rows it produces. */
export const auditContext = new AsyncLocalStorage<AuditContext>();
