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
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseResponseDto } from './dto/expense-response.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  @ApiOperation({ summary: 'List expenses' })
  async findAll(
    @CurrentShop() shopId: string,
    @Query() query: QueryExpensesDto,
  ): Promise<PaginatedResult<ExpenseResponseDto>> {
    const result = await this.service.findAll(shopId, query);
    return { data: result.data.map(ExpenseResponseDto.from), meta: result.meta };
  }

  @Post()
  @ApiOperation({ summary: 'Create an expense' })
  @ApiOkResponse({ type: ExpenseResponseDto })
  async create(
    @CurrentShop() shopId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateExpenseDto,
  ): Promise<ExpenseResponseDto> {
    return ExpenseResponseDto.from(
      await this.service.create(shopId, userId, dto),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an expense' })
  @ApiOkResponse({ type: ExpenseResponseDto })
  async update(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ): Promise<ExpenseResponseDto> {
    return ExpenseResponseDto.from(await this.service.update(shopId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an expense' })
  async remove(
    @CurrentShop() shopId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.remove(shopId, id);
  }
}
