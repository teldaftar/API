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
import { CurrentShop, PaginatedResult } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessoriesService } from './accessories.service';
import {
  AccessoryResponseDto,
  StockEntryResponseDto,
} from './dto/accessory-response.dto';
import { CreateAccessoryDto } from './dto/create-accessory.dto';
import { QueryAccessoriesDto } from './dto/query-accessories.dto';
import { QuerySoldAccessoriesDto } from './dto/query-sold-accessories.dto';
import {
  SoldAccessoryDetailDto,
  SoldAccessoryRowDto,
} from './dto/sold-accessory.dto';
import { AddStockDto, UpdateAccessoryDto } from './dto/update-accessory.dto';

@ApiTags('accessories')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('accessories')
export class AccessoriesController {
  constructor(private readonly service: AccessoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List accessories' })
  async findAll(
    @CurrentShop() shopId: string,
    @Query() query: QueryAccessoriesDto,
  ): Promise<PaginatedResult<AccessoryResponseDto>> {
    const result = await this.service.findAll(shopId, query);
    return {
      data: result.data.map(AccessoryResponseDto.from),
      meta: result.meta,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create an accessory + first stock entry' })
  @ApiOkResponse({ type: AccessoryResponseDto })
  async create(
    @CurrentShop() shopId: string,
    @Body() dto: CreateAccessoryDto,
  ): Promise<AccessoryResponseDto> {
    return AccessoryResponseDto.from(await this.service.create(shopId, dto));
  }

  // NOTE: declared before ':id' so 'sold' isn't captured by the UUID param.
  @Get('sold')
  @ApiOperation({
    summary: 'Sold accessories, one aggregated row per accessory',
  })
  findSold(
    @CurrentShop() shopId: string,
    @Query() query: QuerySoldAccessoriesDto,
  ): Promise<PaginatedResult<SoldAccessoryRowDto>> {
    return this.service.findSold(shopId, query);
  }

  @Get(':id/sold')
  @ApiOperation({
    summary: 'Sold breakdown for one accessory (qty sold at each price)',
  })
  @ApiOkResponse({ type: SoldAccessoryDetailDto })
  soldBreakdown(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SoldAccessoryDetailDto> {
    return this.service.soldBreakdown(shopId, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one accessory' })
  @ApiOkResponse({ type: AccessoryResponseDto })
  async findOne(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccessoryResponseDto> {
    return AccessoryResponseDto.from(await this.service.findOne(shopId, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an accessory (not quantity)' })
  @ApiOkResponse({ type: AccessoryResponseDto })
  async update(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccessoryDto,
  ): Promise<AccessoryResponseDto> {
    return AccessoryResponseDto.from(
      await this.service.update(shopId, id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an accessory' })
  async remove(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.remove(shopId, id);
  }

  @Post(':id/stock')
  @ApiOperation({ summary: 'Add stock (new intake at possibly new cost)' })
  @ApiOkResponse({ type: AccessoryResponseDto })
  async addStock(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddStockDto,
  ): Promise<AccessoryResponseDto> {
    return AccessoryResponseDto.from(
      await this.service.addStock(shopId, id, dto),
    );
  }

  @Get(':id/stock')
  @ApiOperation({
    summary:
      'List stock intake history. ?available=true → only batches with units left (oldest-first), for the sale batch picker',
  })
  @ApiOkResponse({ type: [StockEntryResponseDto] })
  async listStock(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('available') available?: string,
  ): Promise<StockEntryResponseDto[]> {
    const entries = await this.service.listStock(
      shopId,
      id,
      available === 'true',
    );
    return entries.map(StockEntryResponseDto.from);
  }
}
