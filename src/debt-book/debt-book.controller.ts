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
import { CreateDebtBookEntryDto } from './dto/create-debt-book-entry.dto';
import { DebtBookEntryResponseDto } from './dto/debt-book-entry-response.dto';
import { QueryDebtBookDto } from './dto/query-debt-book.dto';
import { UpdateDebtBookEntryDto } from './dto/update-debt-book-entry.dto';
import { DebtBookService } from './debt-book.service';

@ApiTags('debt-book')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('debt-book')
export class DebtBookController {
  constructor(private readonly service: DebtBookService) {}

  @Get()
  @ApiOperation({ summary: 'List debt book entries (qarz daftari)' })
  async findAll(
    @CurrentShop() shopId: string,
    @Query() query: QueryDebtBookDto,
  ): Promise<PaginatedResult<DebtBookEntryResponseDto>> {
    const result = await this.service.findAll(shopId, query);
    return {
      data: result.data.map(DebtBookEntryResponseDto.from),
      meta: result.meta,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a debt book entry' })
  @ApiOkResponse({ type: DebtBookEntryResponseDto })
  async findOne(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DebtBookEntryResponseDto> {
    return DebtBookEntryResponseDto.from(
      await this.service.findOne(shopId, id),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a debt book entry' })
  @ApiOkResponse({ type: DebtBookEntryResponseDto })
  async create(
    @CurrentShop() shopId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateDebtBookEntryDto,
  ): Promise<DebtBookEntryResponseDto> {
    return DebtBookEntryResponseDto.from(
      await this.service.create(shopId, userId, dto),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a debt book entry' })
  @ApiOkResponse({ type: DebtBookEntryResponseDto })
  async update(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDebtBookEntryDto,
  ): Promise<DebtBookEntryResponseDto> {
    return DebtBookEntryResponseDto.from(
      await this.service.update(shopId, id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a debt book entry' })
  async remove(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.remove(shopId, id);
  }
}
