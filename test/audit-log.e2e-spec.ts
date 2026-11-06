import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerShop, resetDatabase } from './test-app';

interface AuditRow {
  shop_id: string | null;
  table_name: string;
  row_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  actor_id: string | null;
  request_id: string | null;
  transaction_id: string;
}

describe('Audit log (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());

  const rows = (where: string, params: unknown[]): Promise<AuditRow[]> =>
    dataSource.query(
      `SELECT * FROM audit_log WHERE ${where} ORDER BY id`,
      params,
    );

  const ownerId = async (login: string): Promise<string> => {
    const [user] = await dataSource.query(
      `SELECT id FROM users WHERE login = $1`,
      [login],
    );
    return user.id as string;
  };

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    dataSource = ctx.dataSource;
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    await dataSource.query(`TRUNCATE TABLE audit_log`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('records one sale as a single transaction with its actor and request id', async () => {
    const shop = await registerShop(app, 'auditsale');
    const actor = await ownerId(shop.login);
    const phone = await api()
      .post('/api/phones')
      .set(auth(shop.accessToken))
      .send({ name: 'iPhone 13', purchasePrice: 500 })
      .expect(201);
    const sale = await api()
      .post('/api/sales')
      .set(auth(shop.accessToken))
      .set('x-request-id', 'req-audit-sale')
      .send({
        items: [{ type: 'PHONE', phoneId: phone.body.id, unitPrice: 600 }],
      })
      .expect(201);

    const logged = await rows(`request_id = $1`, ['req-audit-sale']);
    const tables = logged.map((r) => `${r.table_name}:${r.action}`).sort();
    expect(tables).toEqual([
      'phones:UPDATE',
      'sale_items:INSERT',
      'sales:INSERT',
    ]);
    expect(new Set(logged.map((r) => r.actor_id))).toEqual(new Set([actor]));
    expect(new Set(logged.map((r) => r.transaction_id)).size).toBe(1);
    expect(logged.find((r) => r.table_name === 'sales')?.row_id).toBe(
      sale.body.id,
    );
    const phoneChange = logged.find((r) => r.table_name === 'phones');
    expect(phoneChange?.old_data).toEqual({ status: 'IN_STOCK' });
    expect(phoneChange?.new_data).toEqual({ status: 'SOLD' });
  });

  it('stores only changed columns on update and skips no-op saves', async () => {
    const shop = await registerShop(app, 'auditpatch');
    const actor = await ownerId(shop.login);
    const expense = await api()
      .post('/api/expenses')
      .set(auth(shop.accessToken))
      .send({ amount: 1000, note: 'Rent' })
      .expect(201);

    for (const amount of [2500, 2500]) {
      await api()
        .patch(`/api/expenses/${expense.body.id}`)
        .set(auth(shop.accessToken))
        .send({ amount })
        .expect(200);
    }

    const updates = await rows(`row_id = $1 AND action = 'UPDATE'`, [
      expense.body.id,
    ]);
    expect(updates).toHaveLength(1);
    expect(updates[0].actor_id).toBe(actor);
    expect(updates[0].old_data).toEqual({ amount: 1000 });
    expect(updates[0].new_data).toEqual({ amount: 2500 });
  });

  it('keeps the contents of soft-deleted and hard-deleted rows', async () => {
    const shop = await registerShop(app, 'auditdelete');
    const actor = await ownerId(shop.login);
    const expense = await api()
      .post('/api/expenses')
      .set(auth(shop.accessToken))
      .send({ amount: 1000, note: 'Rent' })
      .expect(201);
    await api()
      .delete(`/api/expenses/${expense.body.id}`)
      .set(auth(shop.accessToken))
      .expect((res) => expect(res.status).toBeLessThan(300));

    const [softDelete] = await rows(`row_id = $1 AND action = 'UPDATE'`, [
      expense.body.id,
    ]);
    expect(softDelete.actor_id).toBe(actor);
    expect(softDelete.new_data?.deleted_at).toBeTruthy();

    const accessory = await api()
      .post('/api/accessories')
      .set(auth(shop.accessToken))
      .send({ name: 'Case', purchasePrice: 10, salePrice: 20, quantity: 1 })
      .expect(201);
    const receipt = await api()
      .post('/api/stock-receipts')
      .set(auth(shop.accessToken))
      .send({
        items: [
          { accessoryId: accessory.body.id, quantity: 2, purchasePrice: 15 },
        ],
      })
      .expect(201);
    await api()
      .delete(`/api/stock-receipts/${receipt.body.id}`)
      .set(auth(shop.accessToken))
      .expect((res) => expect(res.status).toBeLessThan(300));

    const [hardDelete] = await rows(
      `table_name = 'stock_receipts' AND row_id = $1 AND action = 'DELETE'`,
      [receipt.body.id],
    );
    expect(hardDelete.actor_id).toBe(actor);
    expect(hardDelete.old_data?.code).toBe(receipt.body.code);
  });

  it('logs nothing when the transaction rolls back', async () => {
    const shop = await registerShop(app, 'auditrollback');
    const phone = await api()
      .post('/api/phones')
      .set(auth(shop.accessToken))
      .send({ name: 'iPhone 13', purchasePrice: 500 })
      .expect(201);

    await api()
      .post('/api/sales')
      .set(auth(shop.accessToken))
      .set('x-request-id', 'req-audit-rollback')
      .send({
        items: [{ type: 'PHONE', phoneId: phone.body.id, unitPrice: 600 }],
        debt: {
          amount: 999999,
          dueDate: '2099-01-01',
          customerName: 'Ali',
          customerPhone: '901234567',
        },
      })
      .expect((res) => expect(res.status).toBeGreaterThanOrEqual(400));

    expect(await rows(`request_id = $1`, ['req-audit-rollback'])).toEqual([]);
  });

  it('never stores a password hash, but records that it changed', async () => {
    const shop = await registerShop(app, 'auditsecret');
    const actor = await ownerId(shop.login);
    await api()
      .patch('/api/auth/password')
      .set(auth(shop.accessToken))
      .send({
        currentPassword: 'password123',
        newPassword: 'password456',
        confirmPassword: 'password456',
      })
      .expect((res) => expect(res.status).toBeLessThan(300));

    const [{ password_hash: hash }] = await dataSource.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [actor],
    );
    const [{ leaks }] = await dataSource.query(
      `SELECT count(*)::int AS leaks FROM audit_log
        WHERE old_data::text LIKE '%argon2%' OR new_data::text LIKE '%argon2%'`,
    );
    expect(String(hash)).toContain('argon2');
    expect(leaks).toBe(0);

    const [change] = await rows(
      `table_name = 'users' AND action = 'UPDATE'`,
      [],
    );
    expect(change.actor_id).toBe(actor);
    expect(change.new_data).toEqual({ password_hash: '[hidden]' });
  });

  it('does not leak an actor from a previous request on a pooled connection', async () => {
    const first = await registerShop(app, 'auditleakone');
    await api()
      .post('/api/expenses')
      .set(auth(first.accessToken))
      .send({ amount: 1000, note: 'Rent' })
      .expect(201);

    const second = await registerShop(app, 'auditleaktwo');
    const secondOwner = await ownerId(second.login);
    const [signup] = await rows(`table_name = 'users' AND row_id = $1`, [
      secondOwner,
    ]);
    expect(signup.actor_id).toBeNull();
    expect(signup.new_data?.password_hash).toBe('[hidden]');
  });
});
