import type { Response } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { sendLoginPage } from './mcp-login-page';

const CODE_TTL_SECONDS = 5 * 60;
const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_REQUEST_TTL_MS = 10 * 60 * 1000;
const MAX_CLIENTS = 1000;

/** Claude's hosted callbacks, per Claude's connector authentication docs. */
const HOSTED_REDIRECT_URIS = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
]);

function isAllowedRedirectUri(uri: string): boolean {
  if (HOSTED_REDIRECT_URIS.has(uri)) return true;
  // Claude Code's RFC 8252 loopback redirect on an ephemeral port.
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      url.pathname === '/callback' &&
      !url.search
    );
  } catch {
    return false;
  }
}

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const randomToken = (): string => randomBytes(32).toString('base64url');

/** What the login form carries between `/authorize` and `/mcp-login`. */
export interface LoginRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes: string[];
  expiresAt: number;
}

/**
 * OAuth for a single admin. Sign-in uses a dedicated password, never a shop
 * owner's login, because this endpoint can read every shop's data.
 */
export class McpOAuthProvider implements OAuthServerProvider {
  constructor(
    private readonly dataSource: DataSource,
    private readonly publicUrl: URL,
    private readonly adminPasswordHash: string,
  ) {}

  readonly clientsStore: OAuthRegisteredClientsStore = {
    getClient: async (clientId) => {
      const [row] = await this.dataSource.query(
        `SELECT metadata FROM mcp_oauth_clients WHERE client_id = $1`,
        [clientId],
      );
      return row?.metadata as OAuthClientInformationFull | undefined;
    },
    registerClient: async (client) => {
      if (!client.redirect_uris.every((u) => isAllowedRedirectUri(String(u)))) {
        throw new InvalidClientMetadataError(
          'Only Claude redirect URIs are allowed',
        );
      }
      await this.purgeStale();
      const [{ count }] = await this.dataSource.query(
        `SELECT count(*)::int AS count FROM mcp_oauth_clients`,
      );
      if (count >= MAX_CLIENTS) {
        throw new InvalidClientMetadataError('Too many registered clients');
      }
      const full = client as OAuthClientInformationFull;
      await this.dataSource.query(
        `INSERT INTO mcp_oauth_clients (client_id, metadata) VALUES ($1, $2)`,
        [full.client_id, JSON.stringify(full)],
      );
      return full;
    },
  };

  /** Open registration would otherwise grow these tables without bound. */
  private async purgeStale(): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM mcp_oauth_tokens WHERE expires_at < now()`,
    );
    await this.dataSource.query(
      `DELETE FROM mcp_oauth_codes WHERE expires_at < now()`,
    );
    await this.dataSource.query(`
      DELETE FROM mcp_oauth_clients c
       WHERE c.created_at < now() - interval '1 day'
         AND NOT EXISTS (SELECT 1 FROM mcp_oauth_tokens t WHERE t.client_id = c.client_id)
    `);
  }

  private assertResource(resource?: URL): void {
    if (resource && resource.href !== this.publicUrl.href) {
      throw new InvalidTargetError('Unknown resource');
    }
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    this.assertResource(params.resource);
    const signed = this.signLoginRequest({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: params.scopes ?? [],
      expiresAt: Date.now() + LOGIN_REQUEST_TTL_MS,
    });
    sendLoginPage(res, {
      signedRequest: signed,
      redirectUri: params.redirectUri,
    });
  }

  signLoginRequest(request: LoginRequest): string {
    const body = Buffer.from(JSON.stringify(request)).toString('base64url');
    return `${body}.${this.loginSignature(body)}`;
  }

  /** Returns null for a tampered or expired form. */
  verifyLoginRequest(signed: string): LoginRequest | null {
    const [body, signature] = signed.split('.');
    if (!body || !signature) return null;
    const expected = Buffer.from(this.loginSignature(body));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length) return null;
    if (!timingSafeEqual(expected, actual)) return null;
    const request = JSON.parse(
      Buffer.from(body, 'base64url').toString(),
    ) as LoginRequest;
    return request.expiresAt > Date.now() ? request : null;
  }

  /** Keyed by the password hash, so changing the password voids open forms. */
  private loginSignature(body: string): string {
    return createHmac('sha256', `mcp-login:${this.adminPasswordHash}`)
      .update(body)
      .digest('base64url');
  }

  getAdminPasswordHash(): string {
    return this.adminPasswordHash;
  }

  async issueAuthorizationCode(request: LoginRequest): Promise<string> {
    const code = randomToken();
    await this.dataSource.query(
      `INSERT INTO mcp_oauth_codes
         (code_hash, client_id, redirect_uri, code_challenge, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
      [
        sha256(code),
        request.clientId,
        request.redirectUri,
        request.codeChallenge,
        request.scopes,
        CODE_TTL_SECONDS,
      ],
    );
    return code;
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const [row] = await this.dataSource.query(
      `SELECT code_challenge FROM mcp_oauth_codes
        WHERE code_hash = $1 AND client_id = $2 AND expires_at > now()`,
      [sha256(authorizationCode), client.client_id],
    );
    if (!row) throw new InvalidGrantError('Invalid authorization code');
    return row.code_challenge as string;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.assertResource(resource);
    // Single use: the DELETE decides which of two concurrent exchanges wins.
    const [rows] = await this.dataSource.query(
      `DELETE FROM mcp_oauth_codes
        WHERE code_hash = $1 AND client_id = $2 AND expires_at > now()
        RETURNING redirect_uri, scopes`,
      [sha256(authorizationCode), client.client_id],
    );
    const row = rows?.[0];
    if (!row || (redirectUri && redirectUri !== row.redirect_uri)) {
      throw new InvalidGrantError('Invalid authorization code');
    }
    return this.issueTokens(client.client_id, row.scopes as string[]);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.assertResource(resource);
    // Rotation: a refresh token works once.
    const [rows] = await this.dataSource.query(
      `DELETE FROM mcp_oauth_tokens
        WHERE token_hash = $1 AND kind = 'refresh' AND client_id = $2 AND expires_at > now()
        RETURNING scopes`,
      [sha256(refreshToken), client.client_id],
    );
    const row = rows?.[0];
    if (!row) throw new InvalidGrantError('Invalid refresh token');
    return this.issueTokens(client.client_id, row.scopes as string[]);
  }

  private async issueTokens(
    clientId: string,
    scopes: string[],
  ): Promise<OAuthTokens> {
    const accessToken = randomToken();
    const refreshToken = randomToken();
    await this.dataSource.query(
      `INSERT INTO mcp_oauth_tokens (token_hash, kind, client_id, scopes, expires_at)
       VALUES ($1, 'access', $3, $4, now() + make_interval(secs => $5)),
              ($2, 'refresh', $3, $4, now() + make_interval(secs => $6))`,
      [
        sha256(accessToken),
        sha256(refreshToken),
        clientId,
        scopes,
        ACCESS_TTL_SECONDS,
        REFRESH_TTL_SECONDS,
      ],
    );
    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: scopes.join(' ') || undefined,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const [row] = await this.dataSource.query(
      `SELECT client_id, scopes, extract(epoch FROM expires_at)::bigint AS expires_at
         FROM mcp_oauth_tokens
        WHERE token_hash = $1 AND kind = 'access' AND expires_at > now()`,
      [sha256(token)],
    );
    if (!row) throw new InvalidTokenError('Invalid or expired token');
    return {
      token,
      clientId: row.client_id as string,
      scopes: row.scopes as string[],
      expiresAt: Number(row.expires_at),
      resource: this.publicUrl,
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM mcp_oauth_tokens WHERE token_hash = $1 AND client_id = $2`,
      [sha256(request.token), client.client_id],
    );
  }
}
