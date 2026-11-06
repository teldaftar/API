import { Request } from 'express';

/** Payload attached to the request by the JWT guard. */
export interface AuthContext {
  userId: string;
  shopId: string;
  login: string;
  role: string;
}

// `Omit`: the MCP SDK declares its own global `Request.auth` for /mcp requests.
export interface AuthenticatedRequest extends Omit<Request, 'auth'> {
  auth: AuthContext;
}
