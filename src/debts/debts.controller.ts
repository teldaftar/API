import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentShop, PaginatedResult } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DebtResponseDto } from './dto/debt-response.dto';
import { QueryDebtsDto } from './dto/query-debts.dto';
import { PayDebtDto, UpdateDebtDto } from './dto/update-debt.dto';
import { DebtsService } from './debts.service';

@ApiTags('debts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Get()
  @ApiOperation({ summary: 'List debts (status/overdue/date/search)' })
  findAll(
    @CurrentShop() shopId: string,
    @Query() query: QueryDebtsDto,
  ): Promise<PaginatedResult<DebtResponseDto>> {
    return this.debtsService.findAll(shopId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one debt' })
  @ApiOkResponse({ type: DebtResponseDto })
  findOne(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DebtResponseDto> {
    return this.debtsService.findOne(shopId, id);
  }

  @Post(':id/pay')
  @ApiOperation({ summary: 'Settle a debt in full' })
  @ApiOkResponse({ type: DebtResponseDto })
  pay(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayDebtDto,
  ): Promise<DebtResponseDto> {
    return this.debtsService.pay(shopId, id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Extend due date / edit note' })
  @ApiOkResponse({ type: DebtResponseDto })
  update(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDebtDto,
  ): Promise<DebtResponseDto> {
    return this.debtsService.update(shopId, id, dto);
  }
}
