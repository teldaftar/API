import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  json,
  NextFunction,
  Request,
  Response,
  Router,
  urlencoded,
} from 'express';
import { rateLimit } from 'express-rate-limit';
import { DataSource } from 'typeorm';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { readMcpConfig } from './mcp-config';
import { McpDb } from './mcp-db';
import { sendLoginPage } from './mcp-login-page';
import { McpOAuthProvider } from './mcp-oauth.provider';
import { createMcpServer } from './mcp-tools';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const WRONG_PASSWORD = "Parol noto'g'ri";

/**
 * Mounts the remote MCP endpoint and its OAuth routes at the application root.
 * Call before `app.init()` / `app.listen()`. Does nothing unless configured.
 */
export function setupMcp(app: INestApplication): void {
  const logger = new Logger('Mcp');
  const config = readMcpConfig(app.get(ConfigService));
  if (!config) {
    logger.log('MCP endpoint is disabled');
    return;
  }

  const { publicUrl } = config;
  const provider = new McpOAuthProvider(
    app.get(DataSource),
    publicUrl,
    config.adminPasswordHash,
  );
  const db = new McpDb(config.db);

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: new URL(publicUrl.origin),
      resourceServerUrl: publicUrl,
      scopesSupported: ['db:read', 'offline_access'],
      resourceName: 'Teldaftar database',
    }),
  );

  const loginLimiters = [
    { limit: 5 }, // per address
    { limit: 30, keyGenerator: () => 'all' }, // a guess spread across addresses
  ].map((options) =>
    rateLimit({
      windowMs: LOGIN_WINDOW_MS,
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
      validate: { keyGeneratorIpFallback: false },
      ...options,
    }),
  );

  // Body parsers stay inside a Router: Nest skips its own global parsers when it
  // finds a parser mounted directly on the app, which would empty every API body.
  const loginRouter = Router();
  loginRouter.use(
    urlencoded({ extended: false, limit: '20kb' }),
    ...loginLimiters,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (req.method !== 'POST') {
          res.status(405).end();
          return;
        }
        const { request: signed, password } = (req.body ?? {}) as {
          request?: string;
          password?: string;
        };
        const request = signed ? provider.verifyLoginRequest(signed) : null;
        if (!request) {
          res
            .status(400)
            .type('text')
            .send("So'rov muddati tugagan. Claude'dan qayta ulaning.");
          return;
        }
        const ok = await argon2
          .verify(provider.getAdminPasswordHash(), password ?? '')
          .catch(() => false);
        if (!ok) {
          res.status(401);
          sendLoginPage(res, {
            signedRequest: signed!,
            redirectUri: request.redirectUri,
            error: WRONG_PASSWORD,
          });
          return;
        }
        const code = await provider.issueAuthorizationCode(request);
        const redirect = new URL(request.redirectUri);
        redirect.searchParams.set('code', code);
        if (request.state) redirect.searchParams.set('state', request.state);
        logger.log(`MCP sign-in for client ${request.clientId}`);
        res.setHeader('Cache-Control', 'no-store');
        res.redirect(303, redirect.href);
      } catch (error) {
        next(error);
      }
    },
  );

  app.use('/mcp-login', loginRouter);

  const mcpRouter = Router();
  mcpRouter.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    requireBearerAuth({
      verifier: provider,
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(publicUrl),
    }),
    json({ limit: '100kb' }),
    async (req: Request, res: Response) => {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).end();
        return;
      }
      // Stateless: nothing survives a request, so restarts drop no sessions.
      const server = createMcpServer(db, req.auth?.clientId);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error(error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
    },
  );

  app.use(publicUrl.pathname, mcpRouter);

  logger.log(`MCP endpoint is enabled at ${publicUrl.href}`);
}
