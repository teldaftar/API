import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentShop } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExportStatisticsDto } from './dto/export-statistics.dto';
import { QueryStatisticsDto } from './dto/query-statistics.dto';
import { DailyStatRowDto, StatisticsSummaryDto } from './dto/statistics.dto';
import { StatisticsExportService } from './statistics-export.service';
import { StatisticsService } from './statistics.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('statistics')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(
    private readonly service: StatisticsService,
    private readonly exportService: StatisticsExportService,
  ) {}

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

  @Get('export')
  @ApiOperation({
    summary:
      'Multi-sheet Excel report (sales, intake, returns, debts, expenses, stock)',
  })
  @ApiProduces(XLSX_MIME)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Header('Content-Type', XLSX_MIME)
  async export(
    @CurrentShop() shopId: string,
    @Query() query: ExportStatisticsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.exportService.build(shopId, query);
    // `Content-Disposition` is not a CORS-safelisted response header — expose it
    // so the browser client can read the filename off the download.
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    return new StreamableFile(buffer);
  }
}
