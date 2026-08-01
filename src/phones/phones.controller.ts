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
import { CreatePhoneDto } from './dto/create-phone.dto';
import {
  PhoneLabelDto,
  PhoneResponseDto,
} from './dto/phone-response.dto';
import { QueryPhonesDto } from './dto/query-phones.dto';
import { UpdatePhoneDto } from './dto/update-phone.dto';
import { PhonesService } from './phones.service';

@ApiTags('phones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('phones')
export class PhonesController {
  constructor(private readonly phonesService: PhonesService) {}

  @Get()
  @ApiOperation({ summary: 'List phones (filter/search/paginate)' })
  async findAll(
    @CurrentShop() shopId: string,
    @Query() query: QueryPhonesDto,
  ): Promise<PaginatedResult<PhoneResponseDto>> {
    const result = await this.phonesService.findAll(shopId, query);
    return {
      data: await this.phonesService.presentMany(shopId, result.data),
      meta: result.meta,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a phone (IN_STOCK)' })
  @ApiOkResponse({ type: PhoneResponseDto })
  async create(
    @CurrentShop() shopId: string,
    @Body() dto: CreatePhoneDto,
  ): Promise<PhoneResponseDto> {
    return this.phonesService.present(
      shopId,
      await this.phonesService.create(shopId, dto),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one phone' })
  @ApiOkResponse({ type: PhoneResponseDto })
  async findOne(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PhoneResponseDto> {
    return this.phonesService.present(
      shopId,
      await this.phonesService.findOne(shopId, id),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a phone' })
  @ApiOkResponse({ type: PhoneResponseDto })
  async update(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePhoneDto,
  ): Promise<PhoneResponseDto> {
    return this.phonesService.present(
      shopId,
      await this.phonesService.update(shopId, id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a phone (only while IN_STOCK)' })
  async remove(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.phonesService.remove(shopId, id);
  }

  @Get(':id/label')
  @ApiOperation({ summary: 'Spec-card label payload (never contains a price)' })
  @ApiOkResponse({ type: PhoneLabelDto })
  label(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PhoneLabelDto> {
    return this.phonesService.label(shopId, id);
  }
}
