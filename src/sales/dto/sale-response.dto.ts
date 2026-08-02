import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SaleItemType } from '../entities/sale-item.entity';
import { SaleStatus, SaleType } from '../entities/sale.entity';

export class SaleProductSnapshotDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) imei: string | null;
  @ApiPropertyOptional({ nullable: true, example: '8 GB / 256 GB' })
  memory: string | null;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
}

export class SaleItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: SaleItemType }) itemType: SaleItemType;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: number;
  @ApiProperty() costPrice: number;
  @ApiProperty() lineTotal: number;
  @ApiProperty() returnedQuantity: number;
  @ApiProperty({ type: SaleProductSnapshotDto })
  product: SaleProductSnapshotDto;
}

export class DebtPaymentLineDto {
  @ApiProperty() amount: number;
  @ApiProperty() paidAt: Date;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
}

export class SaleDebtSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: 'The sale this debt belongs to' })
  saleId: string;
  @ApiProperty() customerName: string;
  @ApiProperty() customerPhone: string;

  @ApiProperty({ description: 'Original debt amount at sale time' })
  originalAmount: number;

  @ApiProperty({ description: 'Remaining outstanding balance' })
  amount: number;

  @ApiProperty({ description: 'Total amount paid so far' })
  paidTotal: number;

  @ApiProperty() dueDate: string;
  @ApiProperty() status: string;
  @ApiProperty() isOverdue: boolean;
  @ApiProperty() daysOverdue: number;

  @ApiProperty({ type: [DebtPaymentLineDto], description: 'Newest first' })
  payments: DebtPaymentLineDto[];
}

/** Days between two shop-local YYYY-MM-DD dates, floored at 0. */
function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(fromDate + 'T00:00:00Z');
  const to = Date.parse(toDate + 'T00:00:00Z');
  return Math.max(0, Math.round((to - from) / 86400000));
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Build the shared debt summary used by both the sales and phones responses.
 * `remaining` is the live outstanding balance; `originalAmount` is what was
 * owed at sale time; `paidTotal` is derived from the payment ledger.
 */
export function buildDebtSummary(params: {
  debtId: string;
  saleId: string;
  customerName: string;
  customerPhone: string;
  originalAmount: number;
  remaining: number;
  dueDate: string;
  status: string;
  today: string;
  payments: Array<{ amount: number; paidAt: Date; note: string | null }>;
}): SaleDebtSummaryDto {
  const isOverdue = params.status === 'OPEN' && params.dueDate < params.today;
  const paidTotal = round2(
    params.payments.reduce((sum, p) => sum + p.amount, 0),
  );
  return {
    id: params.debtId,
    saleId: params.saleId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    originalAmount: params.originalAmount,
    amount: params.remaining,
    paidTotal,
    dueDate: params.dueDate,
    status: params.status,
    isOverdue,
    daysOverdue: isOverdue ? daysBetween(params.dueDate, params.today) : 0,
    payments: params.payments.map((p) => ({
      amount: p.amount,
      paidAt: p.paidAt,
      note: p.note,
    })),
  };
}

export class SaleResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: SaleType }) type: SaleType;
  @ApiProperty() totalAmount: number;
  @ApiProperty() paidAmount: number;
  @ApiProperty() debtAmount: number;
  @ApiProperty({ enum: SaleStatus }) status: SaleStatus;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty() soldAt: Date;

  @ApiProperty({
    description:
      'Profit net of returns: sum (unitPrice - costPrice) * (qty - returnedQty)',
  })
  profit: number;

  @ApiProperty({ type: [SaleItemResponseDto] })
  items: SaleItemResponseDto[];

  @ApiPropertyOptional({ type: SaleDebtSummaryDto, nullable: true })
  debt: SaleDebtSummaryDto | null;
}
