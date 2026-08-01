import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * The ONLY sanctioned way a service learns the current shop id. It always comes
 * from the verified JWT, never from the request body or params — this is the
 * backbone of tenant isolation.
 */
export const CurrentShop = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const shopId = request.auth?.shopId;
    if (!shopId) {
      // Guard should have populated this; reaching here is a wiring bug.
      throw new InternalServerErrorException('Shop context missing');
    }
    return shopId;
  },
);
