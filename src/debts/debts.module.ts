import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Accessory } from '../accessories/entities/accessory.entity';
import { Phone } from '../phones/entities/phone.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';
import { Debt } from './entities/debt.entity';
import { DebtPayment } from './entities/debt-payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Debt,
      DebtPayment,
      Sale,
      SaleItem,
      Phone,
      Accessory,
    ]),
    AuthModule,
  ],
  controllers: [DebtsController],
  providers: [DebtsService],
  exports: [DebtsService],
})
export class DebtsModule {}
