import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CreditorsController } from './creditors.controller';
import { CreditorsService } from './creditors.service';
import { Creditor } from './entities/creditor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Creditor]), AuthModule],
  controllers: [CreditorsController],
  providers: [CreditorsService],
  exports: [CreditorsService],
})
export class CreditorsModule {}
