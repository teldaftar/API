import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { existsSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import sharp from 'sharp';
import {
  createTestApp,
  registerShop,
  resetDatabase,
} from './test-app';

/** A valid tiny PNG buffer for upload tests. */
async function pngBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: '#4f46e5' },
  })
    .png()
    .toBuffer();
}

/** Absolute disk path for an uploaded URL like `/uploads/abc.webp`. */
function uploadPath(url: string): string {
  return join(process.cwd(), 'uploads', url.replace('/uploads/', ''));
}

describe('Shop backend (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());

  const tomorrow = (): string => {
    const d = new Date(Date.now() + 86400000 * 2);
    return d.toISOString().slice(0, 10);
  };

  /** Oldest available stock batch (layer) id for an accessory — the seller
   * picks a batch to sell from, so sale lines need one. */
  const firstBatchId = async (
    token: string,
    accessoryId: string,
  ): Promise<string> => {
    const res = await api()
      .get(`/api/accessories/${accessoryId}/stock?available=true`)
      .set(auth(token))
      .expect(200);
    return res.body[0].id as string;
  };

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    dataSource = ctx.dataSource;
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  it('isolates shops: A cannot read or mutate B rows', async () => {
    const a = await registerShop(app, 'alpha');
    const b = await registerShop(app, 'beta');

    // Shop A creates a phone.
    const created = await api()
      .post('/api/phones')
      .set(auth(a.accessToken))
      .send({ name: 'iPhone 13', imei: '111111111111', purchasePrice: 1000000 })
      .expect(201);
    const phoneId = created.body.id;

    // Shop B cannot read it.
    await api()
      .get(`/api/phones/${phoneId}`)
      .set(auth(b.accessToken))
      .expect(404);

    // Shop B cannot mutate it.
    await api()
      .patch(`/api/phones/${phoneId}`)
      .set(auth(b.accessToken))
      .send({ note: 'hacked' })
      .expect(404);

    // Shop B's list is empty; Shop A sees exactly one.
    const bList = await api()
      .get('/api/phones')
      .set(auth(b.accessToken))
      .expect(200);
    expect(bList.body.meta.total).toBe(0);

    const aList = await api()
      .get('/api/phones')
      .set(auth(a.accessToken))
      .expect(200);
    expect(aList.body.meta.total).toBe(1);
  });

  // ---------------------------------------------------------------------------
  it('creates a phone sale with a debt and splits paid/debt amounts', async () => {
    const a = await registerShop(app, 'debt');
    const phone = await api()
      .post('/api/phones')
      .set(auth(a.accessToken))
      .send({ name: 'Galaxy S22', imei: '222222222222', purchasePrice: 2000000 })
      .expect(201);

    const sale = await api()
      .post('/api/sales')
      .set(auth(a.accessToken))
      .send({
        items: [{ type: 'PHONE', phoneId: phone.body.id, unitPrice: 3000000 }],
        debt: {
          amount: 1000000,
          dueDate: tomorrow(),
          customerName: 'Ali',
          customerPhone: '901234567',
        },
      })
      .expect(201);

    expect(sale.body.totalAmount).toBe(3000000);
    expect(sale.body.paidAmount).toBe(2000000);
    expect(sale.body.debtAmount).toBe(1000000);
    expect(sale.body.debt).not.toBeNull();
    expect(sale.body.debt.customerPhone).toBe('998901234567');
    // Profit = (3,000,000 - 2,000,000) * 1 unit.
    expect(sale.body.profit).toBe(1000000);

    // The phone is now SOLD, and carries both prices + profit.
    const phoneAfter = await api()
      .get(`/api/phones/${phone.body.id}`)
      .set(auth(a.accessToken))
      .expect(200);
    expect(phoneAfter.body.status).toBe('SOLD');
    expect(phoneAfter.body.purchasePrice).toBe(2000000);
    expect(phoneAfter.body.salePrice).toBe(3000000);
    expect(phoneAfter.body.profit).toBe(1000000);

    // The SOLD list echoes the same enriched prices.
    const soldList = await api()
      .get('/api/phones?status=SOLD')
      .set(auth(a.accessToken))
      .expect(200);
    expect(soldList.body.data[0].salePrice).toBe(3000000);
    expect(soldList.body.data[0].purchasePrice).toBe(2000000);

    // It shows up on the debtors list.
    const debts = await api()
      .get('/api/debts?status=OPEN')
      .set(auth(a.accessToken))
      .expect(200);
    expect(debts.body.meta.total).toBe(1);
    expect(debts.body.data[0].amount).toBe(1000000);
  });

  it('rejects a debt larger than the sale price', async () => {
    const a = await registerShop(app, 'debtbig');
    const phone = await api()
      .post('/api/phones')
      .set(auth(a.accessToken))
      .send({ name: 'Redmi', imei: '333333333333', purchasePrice: 500000 })
      .expect(201);

    const res = await api()
      .post('/api/sales')
      .set(auth(a.accessToken))
      .send({
        items: [{ type: 'PHONE', phoneId: phone.body.id, unitPrice: 1000000 }],
        debt: {
          amount: 2000000,
          dueDate: tomorrow(),
          customerName: 'Ali',
          customerPhone: '901234567',
        },
      })
      .expect(400);
    expect(res.body.code).toBe('DEBT_EXCEEDS_TOTAL');
  });

  // ---------------------------------------------------------------------------
  it('rejects over-returning more than was sold', async () => {
    const a = await registerShop(app, 'ret');
    const accessory = await api()
      .post('/api/accessories')
      .set(auth(a.accessToken))
      .send({ name: 'Case', purchasePrice: 10000, quantity: 10, salePrice: 25000 })
      .expect(201);

    const batchId = await firstBatchId(a.accessToken, accessory.body.id);
    const sale = await api()
      .post('/api/sales')
      .set(auth(a.accessToken))
      .send({
        items: [
          {
            type: 'ACCESSORY',
            accessoryId: accessory.body.id,
            stockEntryId: batchId,
            quantity: 2,
            unitPrice: 25000,
          },
        ],
      })
      .expect(201);
    const saleItemId = sale.body.items[0].id;

    // First return of 1 is fine.
    await api()
      .post(`/api/sales/${sale.body.id}/return`)
      .set(auth(a.accessToken))
      .send({ saleItemId, quantity: 1, reason: 'defect' })
      .expect(201);

    // Returning 2 more (only 1 remains) is rejected.
    const res = await api()
      .post(`/api/sales/${sale.body.id}/return`)
      .set(auth(a.accessToken))
      .send({ saleItemId, quantity: 2, reason: 'defect' })
      .expect(409);
    expect(res.body.code).toBe('RETURN_EXCEEDS_SOLD');

    // Stock was restored by exactly 1 (10 - 2 sold + 1 returned = 9).
    const accAfter = await api()
      .get(`/api/accessories/${accessory.body.id}`)
      .set(auth(a.accessToken))
      .expect(200);
    expect(accAfter.body.quantity).toBe(9);
  });

  // ---------------------------------------------------------------------------
  it('rejects selling more accessories than are in stock', async () => {
    const a = await registerShop(app, 'stock');
    const accessory = await api()
      .post('/api/accessories')
      .set(auth(a.accessToken))
      .send({ name: 'Charger', purchasePrice: 20000, quantity: 3, salePrice: 40000 })
      .expect(201);

    const batchId = await firstBatchId(a.accessToken, accessory.body.id);
    const res = await api()
      .post('/api/sales')
      .set(auth(a.accessToken))
      .send({
        items: [
          {
            type: 'ACCESSORY',
            accessoryId: accessory.body.id,
            stockEntryId: batchId,
            quantity: 5,
            unitPrice: 40000,
          },
        ],
      })
      .expect(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.details.available).toBe(3);
  });

  // ---------------------------------------------------------------------------
  it('deletes the image file when a phone is deleted or its image replaced', async () => {
    const a = await registerShop(app, 'img');

    const up1 = await api()
      .post('/api/uploads/image')
      .set(auth(a.accessToken))
      .attach('file', await pngBuffer(), 'a.png')
      .expect(201);
    const url1 = up1.body.url as string;
    expect(existsSync(uploadPath(url1))).toBe(true);

    const phone = await api()
      .post('/api/phones')
      .set(auth(a.accessToken))
      .send({ name: 'iPhone 12', purchasePrice: 1800000, imageUrl: url1 })
      .expect(201);

    // Replace the image → old file removed, new file present.
    const up2 = await api()
      .post('/api/uploads/image')
      .set(auth(a.accessToken))
      .attach('file', await pngBuffer(), 'b.png')
      .expect(201);
    const url2 = up2.body.url as string;

    await api()
      .patch(`/api/phones/${phone.body.id}`)
      .set(auth(a.accessToken))
      .send({ imageUrl: url2 })
      .expect(200);
    expect(existsSync(uploadPath(url1))).toBe(false);
    expect(existsSync(uploadPath(url2))).toBe(true);

    // Delete the phone → its current image is removed too.
    await api()
      .delete(`/api/phones/${phone.body.id}`)
      .set(auth(a.accessToken))
      .expect(204);
    expect(existsSync(uploadPath(url2))).toBe(false);
  });

  // ---------------------------------------------------------------------------
  it('creates a phone without an IMEI', async () => {
    const a = await registerShop(app, 'noimei');
    const created = await api()
      .post('/api/phones')
      .set(auth(a.accessToken))
      .send({ name: 'iPhone 11', purchasePrice: 1500000 })
      .expect(201);
    expect(created.body.imei).toBeNull();
    expect(created.body.status).toBe('IN_STOCK');
  });

  // ---------------------------------------------------------------------------
  it('aggregates sold accessories with a per-price breakdown', async () => {
    const a = await registerShop(app, 'sold');
    // iPhone 11 case: 30 in stock at cost 5000.
    const acc = await api()
      .post('/api/accessories')
      .set(auth(a.accessToken))
      .send({ name: 'iPhone 11 chexol', purchasePrice: 5000, quantity: 30 })
      .expect(201);
    const accId = acc.body.id;

    // Sell 4 @ 7000 and 10 @ 10000 → 14 sold total (both from the opening batch).
    const batchId = await firstBatchId(a.accessToken, accId);
    await api()
      .post('/api/sales')
      .set(auth(a.accessToken))
      .send({
        items: [
          {
            type: 'ACCESSORY',
            accessoryId: accId,
            stockEntryId: batchId,
            quantity: 4,
            unitPrice: 7000,
          },
        ],
      })
      .expect(201);
    await api()
      .post('/api/sales')
      .set(auth(a.accessToken))
      .send({
        items: [
          {
            type: 'ACCESSORY',
            accessoryId: accId,
            stockEntryId: batchId,
            quantity: 10,
            unitPrice: 10000,
          },
        ],
      })
      .expect(201);

    // Sold list: one row, 14 units sold.
    const sold = await api()
      .get('/api/accessories/sold')
      .set(auth(a.accessToken))
      .expect(200);
    expect(sold.body.meta.total).toBe(1);
    const row = sold.body.data[0];
    expect(row.name).toBe('iPhone 11 chexol');
    expect(row.soldQty).toBe(14);
    expect(row.soldAmount).toBe(4 * 7000 + 10 * 10000); // 128000
    expect(row.soldCostAmount).toBe(14 * 5000); // 70000
    expect(row.profit).toBe(128000 - 70000); // 58000
    expect(row.currentQuantity).toBe(30 - 14); // 16

    // Breakdown: two price points.
    const detail = await api()
      .get(`/api/accessories/${accId}/sold`)
      .set(auth(a.accessToken))
      .expect(200);
    expect(detail.body.soldQty).toBe(14);
    expect(detail.body.lines).toHaveLength(2);
    const byPrice = Object.fromEntries(
      detail.body.lines.map((l: { unitPrice: number; quantity: number }) => [
        l.unitPrice,
        l.quantity,
      ]),
    );
    expect(byPrice[7000]).toBe(4);
    expect(byPrice[10000]).toBe(10);
  });

  // ---------------------------------------------------------------------------
  it('allows selling below cost and reflects the loss as negative profit', async () => {
    const a = await registerShop(app, 'loss');

    // Phone bought 2,000,000, sold 1,800,000 → loss 200,000.
    const phone = await api()
      .post('/api/phones')
      .set(auth(a.accessToken))
      .send({ name: 'Old phone', purchasePrice: 2000000 })
      .expect(201);

    // Accessory bought 10,000, sell 2 @ 6,000 → loss 8,000.
    const acc = await api()
      .post('/api/accessories')
      .set(auth(a.accessToken))
      .send({ name: 'Slow mover', purchasePrice: 10000, quantity: 5, salePrice: 8000 })
      .expect(201);
    const batchId = await firstBatchId(a.accessToken, acc.body.id);

    const sale = await api()
      .post('/api/sales')
      .set(auth(a.accessToken))
      .send({
        items: [
          { type: 'PHONE', phoneId: phone.body.id, unitPrice: 1800000 },
          {
            type: 'ACCESSORY',
            accessoryId: acc.body.id,
            stockEntryId: batchId,
            quantity: 2,
            unitPrice: 6000,
          },
        ],
      })
      .expect(201);

    // Sale-level profit is negative: -200,000 + -8,000.
    expect(sale.body.profit).toBe(-208000);

    const stats = await api()
      .get('/api/statistics/summary')
      .set(auth(a.accessToken))
      .expect(200);
    expect(stats.body.phones.profit).toBe(-200000);
    expect(stats.body.accessories.soldAmount).toBe(12000);
    expect(stats.body.accessories.soldCostAmount).toBe(20000);
    expect(stats.body.accessories.profit).toBe(-8000);
    expect(stats.body.totals.grossProfit).toBe(-208000);
  });

  // ---------------------------------------------------------------------------
  it('computes the statistics summary from SQL aggregates', async () => {
    const a = await registerShop(app, 'stats');

    // A phone bought for 2,000,000, sold for 3,000,000 (profit 1,000,000).
    const phone = await api()
      .post('/api/phones')
      .set(auth(a.accessToken))
      .send({ name: 'Pixel', imei: '444444444444', purchasePrice: 2000000 })
      .expect(201);

    // An accessory bought for 10,000, sell 2 @ 25,000 (profit 30,000).
    const acc = await api()
      .post('/api/accessories')
      .set(auth(a.accessToken))
      .send({ name: 'Cable', purchasePrice: 10000, quantity: 10, salePrice: 25000 })
      .expect(201);
    const batchId = await firstBatchId(a.accessToken, acc.body.id);

    // One MIXED sale bundling the phone and the accessory line.
    await api()
      .post('/api/sales')
      .set(auth(a.accessToken))
      .send({
        items: [
          { type: 'PHONE', phoneId: phone.body.id, unitPrice: 3000000 },
          {
            type: 'ACCESSORY',
            accessoryId: acc.body.id,
            stockEntryId: batchId,
            quantity: 2,
            unitPrice: 25000,
          },
        ],
      })
      .expect(201);

    // An expense of 100,000.
    await api()
      .post('/api/expenses')
      .set(auth(a.accessToken))
      .send({ amount: 100000, note: 'Rent' })
      .expect(201);

    const stats = await api()
      .get('/api/statistics/summary')
      .set(auth(a.accessToken))
      .expect(200);

    expect(stats.body.phones.soldCount).toBe(1);
    expect(stats.body.phones.soldAmount).toBe(3000000);
    expect(stats.body.phones.profit).toBe(1000000);
    expect(stats.body.accessories.soldQty).toBe(2);
    expect(stats.body.accessories.soldAmount).toBe(50000);
    expect(stats.body.accessories.profit).toBe(30000);
    expect(stats.body.expenses.total).toBe(100000);
    expect(stats.body.totals.grossProfit).toBe(1030000);
    expect(stats.body.totals.netProfit).toBe(930000);
  });
});
