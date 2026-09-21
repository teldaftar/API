import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StatisticsController } from './statistics.controller';
import { StatisticsExportService } from './statistics-export.service';
import { StatisticsService } from './statistics.service';

@Module({
  imports: [AuthModule],
  controllers: [StatisticsController],
  providers: [StatisticsService, StatisticsExportService],
})
export class StatisticsModule {}
