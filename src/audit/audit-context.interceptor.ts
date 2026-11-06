import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthenticatedRequest } from '../common';
import { auditContext } from './audit-context';

/** `x-request-id` can come from the client, so it is capped before storage. */
const MAX_REQUEST_ID_LENGTH = 100;

/** Runs after guards, so `req.auth` is already set on protected routes. */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { id?: unknown }>();
    const store = {
      actorId: request.auth?.userId,
      requestId: request.id
        ? String(request.id).slice(0, MAX_REQUEST_ID_LENGTH)
        : undefined,
    };
    return new Observable((subscriber) =>
      auditContext.run(store, () => next.handle().subscribe(subscriber)),
    );
  }
}
