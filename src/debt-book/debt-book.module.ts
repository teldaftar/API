import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DebtBookController } from './debt-book.controller';
import { DebtBookService } from './debt-book.service';
import { DebtBookEntry } from './entities/debt-book-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DebtBookEntry]), AuthModule],
  controllers: [DebtBookController],
  providers: [DebtBookService],
  exports: [DebtBookService],
})
export class DebtBookModule {}
