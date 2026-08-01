import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ShopModule } from './shop/shop.module';
import { UploadsModule } from './uploads/uploads.module';
import { PhonesModule } from './phones/phones.module';
import { AccessoriesModule } from './accessories/accessories.module';
import { SalesModule } from './sales/sales.module';
import { DebtsModule } from './debts/debts.module';
import { ExpensesModule } from './expenses/expenses.module';
import { StatisticsModule } from './statistics/statistics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req, res) => {
          const existing = req.headers['x-request-id'];
          const id = Array.isArray(existing) ? existing[0] : existing;
          if (id) return id;
          const generated = `${Date.now().toString(36)}-${Math.round(
            Math.random() * 1e9,
          ).toString(36)}`;
          res.setHeader('x-request-id', generated);
          return generated;
        },
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: ['req.headers.authorization', 'req.body.password'],
        autoLogging: true,
      },
    }),
    DatabaseModule,
    AuthModule,
    ShopModule,
    UploadsModule,
    PhonesModule,
    AccessoriesModule,
    SalesModule,
    DebtsModule,
    ExpensesModule,
    StatisticsModule,
  ],
})
export class AppModule {}
