import { INestApplication } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { join } from 'path';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readMcpConfig } from '../src/mcp/mcp-config';
import { createTestApp, registerShop, resetDatabase } from './test-app';

const RESOURCE = 'http://localhost/mcp';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const PASSWORD = 'test-admin-password';

describe('Remote MCP (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const api = () => request(app.getHttpServer());

  const pkce = () => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  };

  const register = async (redirectUris = [CALLBACK]): Promise<string> => {
    const res = await api()
      .post('/register')
      .send({
        client_name: 'Claude',
        redirect_uris: redirectUris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      })
      .expect(201);
    return res.body.client_id as string;
  };

  const authorizeQuery = (clientId: string, challenge: string) => ({
    client_id: clientId,
    redirect_uri: CALLBACK,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'state-1',
    scope: 'db:read',
    resource: RESOURCE,
  });

  /** Hidden signed field from the rendered login form. */
  const loginField = (html: string): string => {
    const match = /name="request" value="([^"]+)"/.exec(html);
    if (!match) throw new Error('login form not rendered');
    return match[1];
  };

  const signIn = async (clientId: string, challenge: string) => {
    const page = await api()
      .get('/authorize')
      .query(authorizeQuery(clientId, challenge))
      .expect(200);
    const res = await api()
      .post('/mcp-login')
      .type('form')
      .send({ request: loginField(page.text), password: PASSWORD })
      .expect(303);
    const location = new URL(res.headers.location as string);
    expect(location.origin + location.pathname).toBe(CALLBACK);
    expect(location.searchParams.get('state')).toBe('state-1');
    return location.searchParams.get('code') as string;
  };

  const exchangeCode = (clientId: string, code: string, verifier: string) =>
    api().post('/token').type('form').send({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: CALLBACK,
      resource: RESOURCE,
    });

  const connect = async () => {
    const clientId = await register();
    const { verifier, challenge } = pkce();
    const code = await signIn(clientId, challenge);
    const tokens = await exchangeCode(clientId, code, verifier).expect(200);
    return {
      clientId,
      accessToken: tokens.body.access_token as string,
      refreshToken: tokens.body.refresh_token as string,
    };
  };

  const rpc = (token: string, method: string, params: object = {}) =>
    api()
      .post('/mcp')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method, params });

  const callQuery = async (token: string, sql: string, limit?: number) => {
    const res = await rpc(token, 'tools/call', {
      name: 'query',
      arguments: { sql, ...(limit ? { limit } : {}) },
    }).expect(200);
    return res.body.result as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
  };

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    dataSource = ctx.dataSource;
    // The real role script, so the tests cover its grants as well.
    const { DB_HOST, DB_PORT, DB_USER, DB_NAME, DB_PASSWORD } = process.env;
    execFileSync(
      'psql',
      [
        '-q',
        '-h',
        DB_HOST!,
        '-p',
        DB_PORT!,
        '-U',
        DB_USER!,
        '-d',
        DB_NAME!,
        '-f',
        join(__dirname, '../scripts/claude-readonly-role.sql'),
      ],
      { env: { ...process.env, PGPASSWORD: DB_PASSWORD }, stdio: 'pipe' },
    );
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('stays off unless fully configured', () => {
    const settings: Record<string, string> = {
      MCP_PUBLIC_URL: RESOURCE,
      MCP_ADMIN_PASSWORD_HASH: 'hash',
      MCP_DB_PASSWORD: 'password',
    };
    const read = (values: Record<string, string>) =>
      readMcpConfig({ get: <T>(key: string) => values[key] as T });
    expect(read(settings)).not.toBeNull();
    for (const key of Object.keys(settings)) {
      expect(read({ ...settings, [key]: '' })).toBeNull();
    }
  });

  it('answers an unauthenticated call with a 401 that points to the metadata', async () => {
    const res = await api().post('/mcp').send({}).expect(401);
    expect(res.headers['www-authenticate']).toContain(
      'resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp"',
    );

    const resource = await api()
      .get('/.well-known/oauth-protected-resource/mcp')
      .expect(200);
    expect(resource.body.resource).toBe(RESOURCE);
    expect(resource.body.authorization_servers).toEqual(['http://localhost/']);

    const server = await api()
      .get('/.well-known/oauth-authorization-server')
      .expect(200);
    expect(server.body.code_challenge_methods_supported).toEqual(['S256']);
    expect(server.body.registration_endpoint).toBeDefined();
  });

  it('completes the OAuth flow and serves tools to the real MCP client', async () => {
    const { accessToken } = await connect();
    const shop = await registerShop(app, 'mcpclient');

    const server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`),
        {
          requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
        },
      ),
    );
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        'describe_table',
        'list_tables',
        'query',
      ]);
      expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);

      const result = await client.callTool({
        name: 'query',
        arguments: { sql: 'SELECT login FROM users ORDER BY login' },
      });
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(JSON.parse(text).rows).toEqual([[shop.login]]);
    } finally {
      await client.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('keeps secrets closed and refuses every write path', async () => {
    const { accessToken } = await connect();
    await registerShop(app, 'mcpsecret');

    const tables = await rpc(accessToken, 'tools/call', {
      name: 'list_tables',
      arguments: {},
    }).expect(200);
    const listed = JSON.parse(tables.body.result.content[0].text).map(
      (t: { table: string }) => t.table,
    );
    expect(listed).toEqual(
      expect.arrayContaining(['sales', 'users', 'audit_log']),
    );
    expect(listed).not.toContain('refresh_tokens');
    expect(listed.filter((t: string) => t.startsWith('mcp_oauth'))).toEqual([]);

    const columns = await rpc(accessToken, 'tools/call', {
      name: 'describe_table',
      arguments: { table: 'users' },
    }).expect(200);
    const described = JSON.parse(columns.body.result.content[0].text) as Array<{
      column: string;
    }>;
    expect(described.map((c) => c.column)).toContain('login');
    expect(described.map((c) => c.column)).not.toContain('password_hash');

    const refused = [
      'SELECT password_hash FROM users',
      'SELECT * FROM users',
      'SELECT * FROM refresh_tokens',
      'SELECT * FROM mcp_oauth_tokens',
      'SELECT * FROM mcp_oauth_clients',
      "UPDATE shops SET name = 'x'",
      'DELETE FROM sales',
      'WITH d AS (DELETE FROM sales RETURNING id) SELECT * FROM d',
      'CREATE TABLE t (i int)',
      "SELECT 1; COMMIT; UPDATE shops SET name = 'x'",
      "COMMIT; SET default_transaction_read_only = off; UPDATE shops SET name = 'x'",
    ];
    for (const sql of refused) {
      const result = await callQuery(accessToken, sql);
      expect({ sql, isError: result.isError }).toEqual({ sql, isError: true });
    }
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM shops WHERE name = 'x'`,
    );
    expect(count).toBe(0);
  });

  it('caps rows and keeps exact values', async () => {
    const { accessToken } = await connect();
    const capped = await callQuery(
      accessToken,
      'SELECT g FROM generate_series(1, 50) g',
      10,
    );
    const body = JSON.parse(capped.content[0].text);
    expect(body.rows).toHaveLength(10);
    expect(body.truncated).toBe(true);

    const exact = await callQuery(
      accessToken,
      `SELECT 1234.50::numeric(14,2) AS price, timestamptz '2026-01-01 00:00:00+00' AS at, 1 AS id, 2 AS id`,
    );
    const row = JSON.parse(exact.content[0].text);
    expect(row.columns).toEqual(['price', 'at', 'id', 'id']);
    expect(row.rows[0]).toEqual([
      '1234.50',
      '2026-01-01 05:00:00+05',
      '1',
      '2',
    ]);
  });

  it('rejects a wrong password, an expired form and a tampered form', async () => {
    const clientId = await register();
    const { challenge } = pkce();
    const page = await api()
      .get('/authorize')
      .query(authorizeQuery(clientId, challenge))
      .expect(200);
    const signed = loginField(page.text);
    expect(page.headers['x-frame-options']).toBe('DENY');
    expect(page.headers['content-security-policy']).toContain(
      "form-action 'self' https://claude.ai",
    );

    const wrong = await api()
      .post('/mcp-login')
      .type('form')
      .send({ request: signed, password: 'wrong' })
      .expect(401);
    expect(wrong.headers.location).toBeUndefined();

    const [body, signature] = signed.split('.');
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString());
    const forge = (changes: object) =>
      `${Buffer.from(JSON.stringify({ ...parsed, ...changes })).toString('base64url')}.${signature}`;
    await api()
      .post('/mcp-login')
      .type('form')
      .send({
        request: forge({ redirectUri: 'https://evil.example/cb' }),
        password: PASSWORD,
      })
      .expect(400);
    await api()
      .post('/mcp-login')
      .type('form')
      .send({ request: forge({ expiresAt: 0 }), password: PASSWORD })
      .expect(400);
  });

  it('allows only Claude redirect URIs', async () => {
    for (const uri of [
      'https://evil.example/callback',
      'https://claude.ai.evil.example/api/mcp/auth_callback',
      'http://localhost:3000/other',
    ]) {
      await api()
        .post('/register')
        .send({ redirect_uris: [uri], token_endpoint_auth_method: 'none' })
        .expect(400);
    }
    expect(await register(['http://localhost/callback'])).toBeTruthy();
    expect(await register(['http://127.0.0.1/callback'])).toBeTruthy();

    const clientId = await register();
    const { challenge } = pkce();
    await api()
      .get('/authorize')
      .query({
        ...authorizeQuery(clientId, challenge),
        redirect_uri: 'https://evil.example/callback',
      })
      .expect(400);
  });

  it('enforces PKCE, single-use codes and the token audience', async () => {
    const clientId = await register();
    const { verifier, challenge } = pkce();

    const wrongPkce = await signIn(clientId, challenge);
    await exchangeCode(clientId, wrongPkce, 'x'.repeat(43)).expect(400);

    const code = await signIn(clientId, challenge);
    await exchangeCode(clientId, code, verifier).expect(200);
    const replay = await exchangeCode(clientId, code, verifier).expect(400);
    expect(replay.body.error).toBe('invalid_grant');

    const otherResource = await signIn(clientId, challenge);
    await api()
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: otherResource,
        code_verifier: verifier,
        resource: 'https://other.example/mcp',
      })
      .expect(400);

    const redirected = await api()
      .get('/authorize')
      .query({
        ...authorizeQuery(clientId, challenge),
        resource: 'https://other.example/mcp',
      })
      .expect(302);
    expect(redirected.headers.location).toContain('error=invalid_target');
  });

  it('does not accept a shop JWT, a refresh token or a raw stored hash', async () => {
    const shop = await registerShop(app, 'mcpjwt');
    await rpc(shop.accessToken, 'tools/list').expect(401);

    const { accessToken, refreshToken } = await connect();
    await rpc(refreshToken, 'tools/list').expect(401);

    const [row] = await dataSource.query(
      `SELECT token_hash FROM mcp_oauth_tokens WHERE kind = 'access' LIMIT 1`,
    );
    await rpc(row.token_hash as string, 'tools/list').expect(401);
    expect(row.token_hash).not.toBe(accessToken);

    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM mcp_oauth_tokens WHERE token_hash IN ($1, $2)`,
      [accessToken, refreshToken],
    );
    expect(count).toBe(0);
  });

  it('rotates refresh tokens and honours expiry and revocation', async () => {
    const { clientId, accessToken, refreshToken } = await connect();

    const refresh = (token: string) =>
      api().post('/token').type('form').send({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: token,
        resource: RESOURCE,
      });

    const rotated = await refresh(refreshToken).expect(200);
    expect(rotated.body.refresh_token).not.toBe(refreshToken);
    await rpc(rotated.body.access_token, 'tools/list').expect(200);
    const replay = await refresh(refreshToken).expect(400);
    expect(replay.body.error).toBe('invalid_grant');

    await dataSource.query(
      `UPDATE mcp_oauth_tokens SET expires_at = now() - interval '1 second'
        WHERE client_id = $1 AND kind = 'access'`,
      [clientId],
    );
    await rpc(accessToken, 'tools/list').expect(401);

    const fresh = await connect();
    await api()
      .post('/revoke')
      .type('form')
      .send({ client_id: fresh.clientId, token: fresh.accessToken })
      .expect(200);
    await rpc(fresh.accessToken, 'tools/list').expect(401);
  });
});
