import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DebtInputDto } from './debt-input.dto';

/** One sale line to reprice. Only the sale price changes — cost is never touched. */
export class UpdateSaleItemPriceDto {
  @ApiProperty({ description: 'Existing sale_item id to reprice' })
  @IsUUID()
  id: string;

  @ApiProperty({ example: 1200000, description: 'New unit sale price' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  unitPrice: number;
}

/**
 * Correct a sale that was recorded with the wrong price(s). Reprices the listed
 * lines (others keep their price) and restates the debt split so that
 * paidAmount + debtAmount = totalAmount. Statistics follow automatically since
 * they are derived from these columns. Cost prices are never recomputed.
 */
export class UpdateSaleDto {
  @ApiProperty({ type: [UpdateSaleItemPriceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleItemPriceDto)
  items: UpdateSaleItemPriceDto[];

  @ApiPropertyOptional({
    type: DebtInputDto,
    description:
      'Restated debt. `amount` is the balance the customer STILL owes (outstanding). Already-collected installments and refunds are preserved. Omit or send null when nothing is owed (fully-cash / fully-settled). Editing works even with returns or prior repayments; the new total just cannot fall below cash already collected.',
    nullable: true,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DebtInputDto)
  debt?: DebtInputDto | null;
}
