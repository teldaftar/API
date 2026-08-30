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
import { CreateCreditorDto } from './dto/create-creditor.dto';
import { CreditorResponseDto } from './dto/creditor-response.dto';
import { QueryCreditorsDto } from './dto/query-creditors.dto';
import { UpdateCreditorDto } from './dto/update-creditor.dto';
import { CreditorsService } from './creditors.service';

@ApiTags('creditors')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('creditors')
export class CreditorsController {
  constructor(private readonly service: CreditorsService) {}

  @Get()
  @ApiOperation({ summary: 'List creditors (haqdorlar)' })
  async findAll(
    @CurrentShop() shopId: string,
    @Query() query: QueryCreditorsDto,
  ): Promise<PaginatedResult<CreditorResponseDto>> {
    const result = await this.service.findAll(shopId, query);
    return {
      data: result.data.map(CreditorResponseDto.from),
      meta: result.meta,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a creditor' })
  @ApiOkResponse({ type: CreditorResponseDto })
  async create(
    @CurrentShop() shopId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateCreditorDto,
  ): Promise<CreditorResponseDto> {
    return CreditorResponseDto.from(
      await this.service.create(shopId, userId, dto),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a creditor' })
  @ApiOkResponse({ type: CreditorResponseDto })
  async update(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCreditorDto,
  ): Promise<CreditorResponseDto> {
    return CreditorResponseDto.from(await this.service.update(shopId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a creditor' })
  async remove(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.remove(shopId, id);
  }
}
