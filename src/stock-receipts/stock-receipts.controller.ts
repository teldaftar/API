import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CurrentShop, CurrentUser, PaginatedResult } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { QueryStockReceiptsDto } from './dto/query-stock-receipts.dto';
import { StockReceiptResponseDto } from './dto/stock-receipt-response.dto';
import { UpdateStockReceiptDto } from './dto/update-stock-receipt.dto';
import { StockReceiptsService } from './stock-receipts.service';

@ApiTags('stock-receipts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('stock-receipts')
export class StockReceiptsController {
  constructor(private readonly service: StockReceiptsService) {}

  @Get()
  @ApiOperation({ summary: 'List stock receipts (prixod), newest first' })
  findAll(
    @CurrentShop() shopId: string,
    @Query() query: QueryStockReceiptsDto,
  ): Promise<PaginatedResult<StockReceiptResponseDto>> {
    return this.service.findAll(shopId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one stock receipt with its lines' })
  @ApiOkResponse({ type: StockReceiptResponseDto })
  findOne(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockReceiptResponseDto> {
    return this.service.findOne(shopId, id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a grouped intake: restock existing and/or create new accessories',
  })
  @ApiOkResponse({ type: StockReceiptResponseDto })
  create(
    @CurrentShop() shopId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    return this.service.create(shopId, userId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a receipt (replaces its lines; adjusts stock accordingly)',
  })
  @ApiOkResponse({ type: StockReceiptResponseDto })
  update(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockReceiptDto,
  ): Promise<StockReceiptResponseDto> {
    return this.service.update(shopId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a receipt (only if none of its units have been sold)',
  })
  remove(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.remove(shopId, id);
  }
}
