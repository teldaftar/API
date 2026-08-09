import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AccessoriesModule } from '../accessories/accessories.module';
import { Accessory } from '../accessories/entities/accessory.entity';
import { Debt } from '../debts/entities/debt.entity';
import { DebtPayment } from '../debts/entities/debt-payment.entity';
import { Phone } from '../phones/entities/phone.entity';
import { SaleCounter } from './entities/sale-counter.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SaleReturn } from './entities/sale-return.entity';
import { Sale } from './entities/sale.entity';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      SaleReturn,
      SaleCounter,
      Debt,
      DebtPayment,
      Phone,
      Accessory,
    ]),
    AuthModule,
    AccessoriesModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
