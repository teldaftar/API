import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Shop } from '../shop/entities/shop.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { UploadsModule } from '../uploads/uploads.module';
import { Phone } from './entities/phone.entity';
import { PhonesController } from './phones.controller';
import { PhonesService } from './phones.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Phone, Shop, SaleItem]),
    AuthModule,
    UploadsModule,
  ],
  controllers: [PhonesController],
  providers: [PhonesService],
  exports: [PhonesService],
})
export class PhonesModule {}
