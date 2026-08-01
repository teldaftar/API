import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentShop } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QueryStatisticsDto } from './dto/query-statistics.dto';
import {
  DailyStatRowDto,
  StatisticsSummaryDto,
} from './dto/statistics.dto';
import { StatisticsService } from './statistics.service';

@ApiTags('statistics')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly service: StatisticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Aggregated summary (defaults to current month)' })
  @ApiOkResponse({ type: StatisticsSummaryDto })
  summary(
    @CurrentShop() shopId: string,
    @Query() query: QueryStatisticsDto,
  ): Promise<StatisticsSummaryDto> {
    return this.service.summary(shopId, query);
  }

  @Get('daily')
  @ApiOperation({ summary: 'Per-day series for charts (gap-filled)' })
  @ApiOkResponse({ type: [DailyStatRowDto] })
  daily(
    @CurrentShop() shopId: string,
    @Query() query: QueryStatisticsDto,
  ): Promise<DailyStatRowDto[]> {
    return this.service.daily(shopId, query);
  }
}
