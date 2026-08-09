import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessoriesModule } from '../accessories/accessories.module';
import { AccessoryStockEntry } from '../accessories/entities/accessory-stock-entry.entity';
import { Accessory } from '../accessories/entities/accessory.entity';
import { AuthModule } from '../auth/auth.module';
import { StockReceiptCounter } from './entities/stock-receipt-counter.entity';
import { StockReceipt } from './entities/stock-receipt.entity';
import { StockReceiptsController } from './stock-receipts.controller';
import { StockReceiptsService } from './stock-receipts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockReceipt,
      StockReceiptCounter,
      AccessoryStockEntry,
      Accessory,
    ]),
    AuthModule,
    AccessoriesModule,
  ],
  controllers: [StockReceiptsController],
  providers: [StockReceiptsService],
})
export class StockReceiptsModule {}
