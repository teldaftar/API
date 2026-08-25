import { ApiProperty } from '@nestjs/swagger';

export class StatRangeDto {
  @ApiProperty({ example: '2026-08-01' }) from: string;
  @ApiProperty({ example: '2026-08-31' }) to: string;
}

export class PhoneStatsDto {
  @ApiProperty() purchasedCount: number;
  @ApiProperty() purchasedAmount: number;
  @ApiProperty() soldCount: number;
  @ApiProperty() soldAmount: number;
  @ApiProperty() soldCostAmount: number;
  @ApiProperty() profit: number;
  @ApiProperty() returnedCount: number;
  @ApiProperty() returnedAmount: number;
  @ApiProperty() soldOnDebtCount: number;
  @ApiProperty() soldOnDebtAmount: number;
  @ApiProperty({ description: 'Current snapshot, NOT range-bound' })
  inStockCount: number;
  @ApiProperty({ description: 'Current snapshot, NOT range-bound' })
  inStockCostAmount: number;
}

export class AccessoryStatsDto {
  @ApiProperty() purchasedQty: number;
  @ApiProperty() purchasedAmount: number;
  @ApiProperty() soldQty: number;
  @ApiProperty() soldAmount: number;
  @ApiProperty() soldCostAmount: number;
  @ApiProperty() profit: number;
  @ApiProperty() returnedQty: number;
  @ApiProperty() returnedAmount: number;
  @ApiProperty({ description: 'Current snapshot' }) remainingQty: number;
  @ApiProperty({ description: 'Current snapshot' }) remainingCostAmount: number;
}

export class ExpenseStatsDto {
  @ApiProperty() count: number;
  @ApiProperty() total: number;
}

export class DebtStatsDto {
  @ApiProperty() openCount: number;
  @ApiProperty() openAmount: number;
  @ApiProperty() overdueCount: number;
  @ApiProperty() overdueAmount: number;
  @ApiProperty() createdInRangeCount: number;
  @ApiProperty() createdInRangeAmount: number;
  @ApiProperty() collectedInRange: number;
}

export class TotalsStatsDto {
  @ApiProperty({
    description: 'phone profit + accessory profit, net of returns',
  })
  grossProfit: number;
  @ApiProperty({ description: 'grossProfit - expenses' })
  netProfit: number;
  @ApiProperty({ description: 'sale paidAmount + debts settled within range' })
  cashIn: number;
  @ApiProperty({
    description: 'expenses + phone/accessory purchases within range',
  })
  cashOut: number;
}

export class StatisticsSummaryDto {
  @ApiProperty({ type: StatRangeDto }) range: StatRangeDto;
  @ApiProperty({ type: PhoneStatsDto }) phones: PhoneStatsDto;
  @ApiProperty({ type: AccessoryStatsDto }) accessories: AccessoryStatsDto;
  @ApiProperty({
    type: AccessoryStatsDto,
    description: 'Keypad ("button") phones — same shape as accessories',
  })
  keypadPhones: AccessoryStatsDto;
  @ApiProperty({ type: ExpenseStatsDto }) expenses: ExpenseStatsDto;
  @ApiProperty({ type: DebtStatsDto }) debts: DebtStatsDto;
  @ApiProperty({ type: TotalsStatsDto }) totals: TotalsStatsDto;
}

export class DailyStatRowDto {
  @ApiProperty({ example: '2026-08-01' }) date: string;
  @ApiProperty() salesAmount: number;
  @ApiProperty() profit: number;
  @ApiProperty() expenses: number;
  @ApiProperty() debtCollected: number;
}
