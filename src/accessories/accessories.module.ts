import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { AccessoriesController } from './accessories.controller';
import { AccessoriesService } from './accessories.service';
import { AccessoryStockEntry } from './entities/accessory-stock-entry.entity';
import { Accessory } from './entities/accessory.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Accessory, AccessoryStockEntry, SaleItem]),
    AuthModule,
  ],
  controllers: [AccessoriesController],
  providers: [AccessoriesService],
  exports: [AccessoriesService],
})
export class AccessoriesModule {}
