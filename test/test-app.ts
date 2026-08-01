import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common';

export interface TestContext {
  app: INestApplication;
  dataSource: DataSource;
}

/**
 * Boots the real AppModule against the test DB, ensures the schema exists via
 * migrations, and applies the same global pipe + filter as production so error
 * codes match what the frontend sees.
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    // The auth throttler (5/min) would trip the rapid registrations these
    // tests perform from a single IP; disable it for the suite.
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();

  return { app, dataSource };
}

/** Wipe all business data between test files for isolation. */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query(`
    TRUNCATE TABLE
      sale_returns, sale_items, sales, sale_counters,
      debts, expenses, accessory_stock_entries, accessories,
      phones, refresh_tokens, users, shops
    RESTART IDENTITY CASCADE
  `);
}

let seq = 0;
/** Register a fresh shop + owner and return an authorized request helper. */
export async function registerShop(
  app: INestApplication,
  loginBase: string,
): Promise<{ accessToken: string; login: string }> {
  const request = (await import('supertest')).default;
  const login = `${loginBase}${seq++}`;
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      shopName: `Shop ${login}`,
      fullName: 'Owner',
      login,
      password: 'password123',
      confirmPassword: 'password123',
    })
    .expect(201);
  return { accessToken: res.body.accessToken, login };
}
