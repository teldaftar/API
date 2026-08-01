import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuthContext,
  AuthenticatedRequest,
} from '../types/authenticated-request';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    return data ? auth?.[data] : auth;
  },
);
