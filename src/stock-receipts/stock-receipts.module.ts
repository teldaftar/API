import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessoriesModule } from '../accessories/accessories.module';
import { AuthModule } from '../auth/auth.module';
import { StockReceiptCounter } from './entities/stock-receipt-counter.entity';
import { StockReceiptItem } from './entities/stock-receipt-item.entity';
import { StockReceipt } from './entities/stock-receipt.entity';
import { StockReceiptsController } from './stock-receipts.controller';
import { StockReceiptsService } from './stock-receipts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockReceipt,
      StockReceiptItem,
      StockReceiptCounter,
    ]),
    AuthModule,
    AccessoriesModule,
  ],
  controllers: [StockReceiptsController],
  providers: [StockReceiptsService],
})
export class StockReceiptsModule {}
