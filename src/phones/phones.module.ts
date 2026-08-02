import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Shop } from '../shop/entities/shop.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Debt } from '../debts/entities/debt.entity';
import { DebtPayment } from '../debts/entities/debt-payment.entity';
import { UploadsModule } from '../uploads/uploads.module';
import { Phone } from './entities/phone.entity';
import { PhonesController } from './phones.controller';
import { PhonesService } from './phones.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Phone,
      Shop,
      SaleItem,
      Sale,
      Debt,
      DebtPayment,
    ]),
    AuthModule,
    UploadsModule,
  ],
  controllers: [PhonesController],
  providers: [PhonesService],
  exports: [PhonesService],
})
export class PhonesModule {}
