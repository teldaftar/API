import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  enumerateLocalDates,
  firstDayOfCurrentMonth,
  localDateEndExclusiveUtc,
  localDateStartUtc,
  todayLocalDateString,
} from '../common';
import { QueryStatisticsDto } from './dto/query-statistics.dto';
import {
  DailyStatRowDto,
  StatisticsSummaryDto,
} from './dto/statistics.dto';

/** Coerce a pg numeric/bigint (returned as string) to number. */
function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

interface ResolvedRange {
  from: string;
  to: string;
  fromUtc: Date;
  toExclusiveUtc: Date;
}

@Injectable()
export class StatisticsService {
  constructor(private readonly dataSource: DataSource) {}

  private resolveRange(query: QueryStatisticsDto): ResolvedRange {
    const from = query.from ?? firstDayOfCurrentMonth();
    const to = query.to ?? todayLocalDateString();
    return {
      from,
      to,
      fromUtc: localDateStartUtc(from),
      toExclusiveUtc: localDateEndExclusiveUtc(to),
    };
  }

  async summary(
    shopId: string,
    query: QueryStatisticsDto,
  ): Promise<StatisticsSummaryDto> {
    const range = this.resolveRange(query);

    const [phones] = await this.dataSource.query(
      `
      SELECT
        COALESCE(SUM(unit_price * net), 0)      AS sold_amount,
        COALESCE(SUM(cost_price * net), 0)      AS sold_cost_amount,
        COALESCE(SUM(net), 0)                   AS sold_count
      FROM (
        SELECT si.unit_price, si.cost_price,
               (si.quantity - si.returned_quantity) AS net
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE si.shop_id = $1
          AND si.item_type = 'PHONE'
          AND s.sold_at >= $2 AND s.sold_at < $3
      ) t
      `,
      [shopId, range.fromUtc, range.toExclusiveUtc],
    );

    const [phonesIntake] = await this.dataSource.query(
      `
      SELECT COUNT(*) AS purchased_count,
             COALESCE(SUM(purchase_price), 0) AS purchased_amount
      FROM phones
      WHERE shop_id = $1 AND deleted_at IS NULL
        AND created_at >= $2 AND created_at < $3
      `,
      [shopId, range.fromUtc, range.toExclusiveUtc],
    );

    const [phonesReturns] = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(sr.quantity), 0) AS returned_count,
             COALESCE(SUM(sr.amount), 0)   AS returned_amount
      FROM sale_returns sr
      JOIN sale_items si ON si.id = sr.sale_item_id
      WHERE sr.shop_id = $1 AND si.item_type = 'PHONE'
        AND sr.created_at >= $2 AND sr.created_at < $3
      `,
      [shopId, range.fromUtc, range.toExclusiveUtc],
    );

    const [phonesDebt] = await this.dataSource.query(
      `
      SELECT COUNT(*) AS cnt, COALESCE(SUM(d.amount), 0) AS amount
      FROM debts d
      JOIN sales s ON s.id = d.sale_id
      WHERE d.shop_id = $1 AND s.type = 'PHONE'
        AND s.sold_at >= $2 AND s.sold_at < $3
      `,
      [shopId, range.fromUtc, range.toExclusiveUtc],
    );

    const [phonesStock] = await this.dataSource.query(
      `
      SELECT COUNT(*) AS in_stock_count,
             COALESCE(SUM(purchase_price), 0) AS in_stock_cost_amount
      FROM phones
      WHERE shop_id = $1 AND deleted_at IS NULL AND status = 'IN_STOCK'
      `,
      [shopId],
    );

    const [acc] = await this.dataSource.query(
      `
      SELECT
        COALESCE(SUM(unit_price * net), 0) AS sold_amount,
        COALESCE(SUM(cost_price * net), 0) AS sold_cost_amount,
        COALESCE(SUM(net), 0)              AS sold_qty
      FROM (
        SELECT si.unit_price, si.cost_price,
               (si.quantity - si.returned_quantity) AS net
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE si.shop_id = $1
          AND si.item_type = 'ACCESSORY'
          AND s.sold_at >= $2 AND s.sold_at < $3
      ) t
      `,
      [shopId, range.fromUtc, range.toExclusiveUtc],
    );

    const [accIntake] = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(quantity), 0) AS purchased_qty,
             COALESCE(SUM(quantity * purchase_price), 0) AS purchased_amount
      FROM accessory_stock_entries
      WHERE shop_id = $1 AND created_at >= $2 AND created_at < $3
      `,
      [shopId, range.fromUtc, range.toExclusiveUtc],
    );

    const [accReturns] = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(sr.quantity), 0) AS returned_qty,
             COALESCE(SUM(sr.amount), 0)   AS returned_amount
      FROM sale_returns sr
      JOIN sale_items si ON si.id = sr.sale_item_id
      WHERE sr.shop_id = $1 AND si.item_type = 'ACCESSORY'
        AND sr.created_at >= $2 AND sr.created_at < $3
      `,
      [shopId, range.fromUtc, range.toExclusiveUtc],
    );

    const [accStock] = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(quantity), 0) AS remaining_qty,
             COALESCE(SUM(quantity * purchase_price), 0) AS remaining_cost_amount
      FROM accessories
      WHERE shop_id = $1 AND deleted_at IS NULL
      `,
      [shopId],
    );

    const [expenses] = await this.dataSource.query(
      `
      SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE shop_id = $1 AND deleted_at IS NULL
        AND spent_at >= $2 AND spent_at <= $3
      `,
      [shopId, range.from, range.to],
    );

    const [debtsOpen] = await this.dataSource.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'OPEN') AS open_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'OPEN'), 0) AS open_amount,
        COUNT(*) FILTER (WHERE status = 'OPEN' AND due_date < $2::date) AS overdue_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'OPEN' AND due_date < $2::date), 0) AS overdue_amount
      FROM debts
      WHERE shop_id = $1
      `,
      [shopId, todayLocalDateString()],
    );

    const [debtsCreated] = await this.dataSource.query(
      `
      SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS amount
      FROM debts
      WHERE shop_id = $1 AND created_at >= $2 AND created_at < $3
      `,
      [shopId, range.fromUtc, range.toExclusiveUtc],
    );

    const [debtsCollected] = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS collected
      FROM debts
      WHERE shop_id = $1 AND status = 'PAID'
        AND paid_at >= $2 AND paid_at < $3
      `,
      [shopId, range.fromUtc, range.toExclusiveUtc],
    );

    const [salesPaid] = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(paid_amount), 0) AS paid
      FROM sales
      WHERE shop_id = $1 AND sold_at >= $2 AND sold_at < $3
      `,
      [shopId, range.fromUtc, range.toExclusiveUtc],
    );

    const phoneProfit = num(phones.sold_amount) - num(phones.sold_cost_amount);
    const accProfit = num(acc.sold_amount) - num(acc.sold_cost_amount);
    const grossProfit = phoneProfit + accProfit;
    const expensesTotal = num(expenses.total);
    const purchasesTotal =
      num(phonesIntake.purchased_amount) + num(accIntake.purchased_amount);

    return {
      range: { from: range.from, to: range.to },
      phones: {
        purchasedCount: num(phonesIntake.purchased_count),
        purchasedAmount: num(phonesIntake.purchased_amount),
        soldCount: num(phones.sold_count),
        soldAmount: num(phones.sold_amount),
        soldCostAmount: num(phones.sold_cost_amount),
        profit: this.round2(phoneProfit),
        returnedCount: num(phonesReturns.returned_count),
        returnedAmount: num(phonesReturns.returned_amount),
        soldOnDebtCount: num(phonesDebt.cnt),
        soldOnDebtAmount: num(phonesDebt.amount),
        inStockCount: num(phonesStock.in_stock_count),
        inStockCostAmount: num(phonesStock.in_stock_cost_amount),
      },
      accessories: {
        purchasedQty: num(accIntake.purchased_qty),
        purchasedAmount: num(accIntake.purchased_amount),
        soldQty: num(acc.sold_qty),
        soldAmount: num(acc.sold_amount),
        soldCostAmount: num(acc.sold_cost_amount),
        profit: this.round2(accProfit),
        returnedQty: num(accReturns.returned_qty),
        returnedAmount: num(accReturns.returned_amount),
        remainingQty: num(accStock.remaining_qty),
        remainingCostAmount: num(accStock.remaining_cost_amount),
      },
      expenses: {
        count: num(expenses.cnt),
        total: expensesTotal,
      },
      debts: {
        openCount: num(debtsOpen.open_count),
        openAmount: num(debtsOpen.open_amount),
        overdueCount: num(debtsOpen.overdue_count),
        overdueAmount: num(debtsOpen.overdue_amount),
        createdInRangeCount: num(debtsCreated.cnt),
        createdInRangeAmount: num(debtsCreated.amount),
        collectedInRange: num(debtsCollected.collected),
      },
      totals: {
        grossProfit: this.round2(grossProfit),
        netProfit: this.round2(grossProfit - expensesTotal),
        cashIn: this.round2(
          num(salesPaid.paid) + num(debtsCollected.collected),
        ),
        cashOut: this.round2(expensesTotal + purchasesTotal),
      },
    };
  }

  async daily(
    shopId: string,
    query: QueryStatisticsDto,
  ): Promise<DailyStatRowDto[]> {
    const range = this.resolveRange(query);
    const offset = `${5} hours`; // Asia/Tashkent = UTC+5, fixed

    // Sales amount + profit per shop-local day (net of returns).
    const salesRows: Array<{ d: string; amount: string; profit: string }> =
      await this.dataSource.query(
        `
        SELECT to_char((s.sold_at + interval '${offset}')::date, 'YYYY-MM-DD') AS d,
               COALESCE(SUM(si.unit_price * (si.quantity - si.returned_quantity)), 0) AS amount,
               COALESCE(SUM((si.unit_price - si.cost_price) * (si.quantity - si.returned_quantity)), 0) AS profit
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.shop_id = $1 AND s.sold_at >= $2 AND s.sold_at < $3
        GROUP BY d
        `,
        [shopId, range.fromUtc, range.toExclusiveUtc],
      );

    const expenseRows: Array<{ d: string; total: string }> =
      await this.dataSource.query(
        `
        SELECT to_char(spent_at, 'YYYY-MM-DD') AS d,
               COALESCE(SUM(amount), 0) AS total
        FROM expenses
        WHERE shop_id = $1 AND deleted_at IS NULL
          AND spent_at >= $2 AND spent_at <= $3
        GROUP BY d
        `,
        [shopId, range.from, range.to],
      );

    const debtRows: Array<{ d: string; collected: string }> =
      await this.dataSource.query(
        `
        SELECT to_char((paid_at + interval '${offset}')::date, 'YYYY-MM-DD') AS d,
               COALESCE(SUM(amount), 0) AS collected
        FROM debts
        WHERE shop_id = $1 AND status = 'PAID'
          AND paid_at >= $2 AND paid_at < $3
        GROUP BY d
        `,
        [shopId, range.fromUtc, range.toExclusiveUtc],
      );

    const salesMap = new Map(salesRows.map((r) => [r.d, r]));
    const expenseMap = new Map(expenseRows.map((r) => [r.d, r]));
    const debtMap = new Map(debtRows.map((r) => [r.d, r]));

    // Gap-fill every day in the range with zeros.
    return enumerateLocalDates(range.from, range.to).map((date) => ({
      date,
      salesAmount: this.round2(num(salesMap.get(date)?.amount)),
      profit: this.round2(num(salesMap.get(date)?.profit)),
      expenses: this.round2(num(expenseMap.get(date)?.total)),
      debtCollected: this.round2(num(debtMap.get(date)?.collected)),
    }));
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
