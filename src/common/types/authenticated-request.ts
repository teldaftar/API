import { Request } from 'express';

/** Payload attached to the request by the JWT guard. */
export interface AuthContext {
  userId: string;
  shopId: string;
  login: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}
