import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CurrentShop, CurrentUser, PaginatedResult } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySalesDto } from './dto/query-sales.dto';
import { SaleResponseDto } from './dto/sale-response.dto';
import { SaleReturnResponseDto } from './dto/sale-return-response.dto';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'List sales (type/isDebt/date/search)' })
  findAll(
    @CurrentShop() shopId: string,
    @Query() query: QuerySalesDto,
  ): Promise<PaginatedResult<SaleResponseDto>> {
    return this.salesService.findAll(shopId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one sale with items, product snapshot & debt' })
  @ApiOkResponse({ type: SaleResponseDto })
  findOne(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SaleResponseDto> {
    return this.salesService.findOne(shopId, id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a sale bundling any mix of phones + accessories (optional debt). Each accessory line picks the stock batch to sell from.',
  })
  @ApiOkResponse({ type: SaleResponseDto })
  create(
    @CurrentShop() shopId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateSaleDto,
  ): Promise<SaleResponseDto> {
    return this.salesService.createSale(shopId, userId, dto);
  }

  @Post(':id/return')
  @ApiOperation({ summary: 'Return sold units from a sale' })
  @ApiOkResponse({ type: SaleResponseDto })
  createReturn(
    @CurrentShop() shopId: string,
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReturnDto,
  ): Promise<SaleResponseDto> {
    return this.salesService.createReturn(shopId, userId, id, dto);
  }

  @Get(':id/returns')
  @ApiOperation({ summary: 'List returns for a sale' })
  @ApiOkResponse({ type: [SaleReturnResponseDto] })
  async listReturns(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SaleReturnResponseDto[]> {
    const returns = await this.salesService.listReturns(shopId, id);
    return returns.map(SaleReturnResponseDto.from);
  }
}
