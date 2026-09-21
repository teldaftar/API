import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import {
  firstDayOfCurrentMonth,
  localDateEndExclusiveUtc,
  localDateStartUtc,
  todayLocalDateString,
} from '../common';
import { ExportScope, ExportStatisticsDto } from './dto/export-statistics.dto';

/**
 * Render a `timestamptz` as a shop-local date. `AT TIME ZONE` converts to the
 * shop's wall clock whatever the Postgres session timezone happens to be —
 * unlike `+ interval '5 hours'`, which double-shifts when the session is
 * already running in Asia/Tashkent.
 */
const LOCAL_DATE = (col: string) =>
  `to_char(${col} AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY')`;

const MONEY_FMT = '#,##0';
const INT_FMT = '#,##0';

/** Shown in the sale columns for stock that hasn't been sold yet. */
const UNSOLD = 'Sotilmagan';
const DASH = '—';

const SCOPE_LABEL: Record<ExportScope, string> = {
  [ExportScope.ALL]: 'Barchasi',
  [ExportScope.PHONE]: 'Telefonlar',
  [ExportScope.ACCESSORY]: 'Aksessuarlar',
  [ExportScope.KEYPAD_PHONE]: 'Klaviaturali telefonlar',
};

/** ASCII slug for the downloaded filename (browsers dislike raw unicode). */
const SCOPE_SLUG: Record<ExportScope, string> = {
  [ExportScope.ALL]: 'hammasi',
  [ExportScope.PHONE]: 'telefonlar',
  [ExportScope.ACCESSORY]: 'aksessuarlar',
  [ExportScope.KEYPAD_PHONE]: 'klaviaturali',
};

const COLUMNS = [
  { header: 'Sana', width: 12 },
  { header: 'Nomi', width: 34 },
  { header: 'IMEI', width: 18 },
  { header: 'Miqdori', width: 10 },
  { header: 'Olingan narx', width: 16 },
  { header: 'Sotilgan narx', width: 16 },
  { header: 'Foyda', width: 16 },
];

const COL_QTY = 4;
const COL_COST = 5;
const COL_REVENUE = 6;
const COL_PROFIT = 7;

/** One printed line of the report. */
interface ItemRow {
  /** Sale date `DD.MM.YYYY`; null for stock that is still on hand. */
  date: string | null;
  name: string;
  imei: string | null;
  qty: number;
  /** Purchase cost of the units on this line (unit cost × qty). */
  cost: number;
  /** Sale revenue for the line; null when the goods are still in stock. */
  revenue: number | null;
  /** Profit for the line; null when the goods are still in stock. */
  profit: number | null;
}

/** One category block: its sold lines followed by what is left in stock. */
interface Section {
  title: string;
  sold: ItemRow[];
  remaining: ItemRow[];
}

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
}

/**
 * Builds the Excel report behind `GET /statistics/export`: one sheet listing
 * every product by name with what it cost, what it sold for and the profit,
 * with a JAMI line under each category (and an UMUMIY JAMI when the report
 * covers all of them).
 *
 * Each category lists the units **sold inside the requested month**, then what
 * is **still in stock right now** (a snapshot, like the dashboard's "hozirgi
 * holat" card) with `Sotilmagan` in the sale columns.
 *
 * Profit mirrors `StatisticsService`: `(unitPrice − costPrice) × netQty`
 * plus the amount retained on returned units.
 */
@Injectable()
export class StatisticsExportService {
  constructor(private readonly dataSource: DataSource) {}

  async build(
    shopId: string,
    query: ExportStatisticsDto,
  ): Promise<ExportResult> {
    const scope = query.scope ?? ExportScope.ALL;
    const from = query.from ?? firstDayOfCurrentMonth();
    const to = query.to ?? todayLocalDateString();
    const fromUtc = localDateStartUtc(from);
    const toUtc = localDateEndExclusiveUtc(to);

    const sections: Section[] = [];
    if (scope === ExportScope.ALL || scope === ExportScope.PHONE) {
      sections.push({
        title: 'TELEFONLAR',
        sold: await this.phonesSold(shopId, fromUtc, toUtc),
        remaining: await this.phonesInStock(shopId),
      });
    }
    if (scope === ExportScope.ALL || scope === ExportScope.ACCESSORY) {
      sections.push({
        title: 'AKSESSUARLAR',
        sold: await this.accessoriesSold(shopId, fromUtc, toUtc, 'ACCESSORY'),
        remaining: await this.accessoriesInStock(shopId, 'ACCESSORY'),
      });
    }
    if (scope === ExportScope.ALL || scope === ExportScope.KEYPAD_PHONE) {
      sections.push({
        title: 'KLAVIATURALI TELEFONLAR',
        sold: await this.accessoriesSold(
          shopId,
          fromUtc,
          toUtc,
          'KEYPAD_PHONE',
        ),
        remaining: await this.accessoriesInStock(shopId, 'KEYPAD_PHONE'),
      });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Do'kon";
    wb.created = new Date();
    this.render(wb, scope, from, to, sections);

    const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    return {
      buffer: Buffer.from(buffer),
      filename: `hisobot-${SCOPE_SLUG[scope]}-${from}_${to}.xlsx`,
    };
  }

  /* --- queries -------------------------------------------------------------- */

  /**
   * Sale lines are the unit of a "sold" row — one line per product sold, in
   * chronological order. Quantities and money are net of returns.
   */
  private async phonesSold(
    shopId: string,
    fromUtc: Date,
    toUtc: Date,
  ): Promise<ItemRow[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `
      SELECT ${LOCAL_DATE('s.sold_at')} AS d,
             p.name, p.imei,
             (si.quantity - si.returned_quantity) AS qty,
             (si.cost_price * (si.quantity - si.returned_quantity)) AS cost,
             (si.unit_price * (si.quantity - si.returned_quantity)) AS revenue,
             ((si.unit_price - si.cost_price) * (si.quantity - si.returned_quantity)
               + (si.unit_price * si.returned_quantity - COALESCE(rr.refunded, 0))) AS profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN phones p ON p.id = si.phone_id
      LEFT JOIN (
        SELECT sale_item_id, SUM(amount) AS refunded
        FROM sale_returns WHERE shop_id = $1 GROUP BY sale_item_id
      ) rr ON rr.sale_item_id = si.id
      WHERE si.shop_id = $1 AND si.item_type = 'PHONE'
        AND s.sold_at >= $2 AND s.sold_at < $3
      ORDER BY s.sold_at
      `,
      [shopId, fromUtc, toUtc],
    );
    return this.toSoldRows(rows);
  }

  /** Current stock snapshot — every phone still unsold, whenever it came in. */
  private async phonesInStock(shopId: string): Promise<ItemRow[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `
      SELECT name, imei, purchase_price AS cost
      FROM phones
      WHERE shop_id = $1 AND deleted_at IS NULL AND status = 'IN_STOCK'
      ORDER BY name
      `,
      [shopId],
    );
    return rows.map((r) => ({
      date: null,
      name: String(r.name ?? ''),
      imei: (r.imei as string | null) ?? null,
      qty: 1,
      cost: num(r.cost),
      revenue: null,
      profit: null,
    }));
  }

  private async accessoriesSold(
    shopId: string,
    fromUtc: Date,
    toUtc: Date,
    kind: 'ACCESSORY' | 'KEYPAD_PHONE',
  ): Promise<ItemRow[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `
      SELECT ${LOCAL_DATE('s.sold_at')} AS d,
             a.name, a.imei,
             (si.quantity - si.returned_quantity) AS qty,
             (si.cost_price * (si.quantity - si.returned_quantity)) AS cost,
             (si.unit_price * (si.quantity - si.returned_quantity)) AS revenue,
             ((si.unit_price - si.cost_price) * (si.quantity - si.returned_quantity)
               + (si.unit_price * si.returned_quantity - COALESCE(rr.refunded, 0))) AS profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN accessories a ON a.id = si.accessory_id
      LEFT JOIN (
        SELECT sale_item_id, SUM(amount) AS refunded
        FROM sale_returns WHERE shop_id = $1 GROUP BY sale_item_id
      ) rr ON rr.sale_item_id = si.id
      WHERE si.shop_id = $1 AND si.item_type = $4
        AND s.sold_at >= $2 AND s.sold_at < $3
      ORDER BY s.sold_at
      `,
      [shopId, fromUtc, toUtc, kind],
    );
    return this.toSoldRows(rows);
  }

  /**
   * On-hand units per product, valued layer by layer (a product can hold stock
   * from several batches at different costs) — same maths as the dashboard's
   * `remainingCostAmount`.
   */
  private async accessoriesInStock(
    shopId: string,
    kind: 'ACCESSORY' | 'KEYPAD_PHONE',
  ): Promise<ItemRow[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `
      SELECT a.name, a.imei,
             SUM(ase.remaining_quantity) AS qty,
             SUM(ase.remaining_quantity * ase.purchase_price) AS cost
      FROM accessories a
      JOIN accessory_stock_entries ase ON ase.accessory_id = a.id
      WHERE a.shop_id = $1 AND a.deleted_at IS NULL AND a.kind = $2
      GROUP BY a.id, a.name, a.imei
      HAVING SUM(ase.remaining_quantity) > 0
      ORDER BY a.name
      `,
      [shopId, kind],
    );
    return rows.map((r) => ({
      date: null,
      name: String(r.name ?? ''),
      imei: (r.imei as string | null) ?? null,
      qty: num(r.qty),
      cost: num(r.cost),
      revenue: null,
      profit: null,
    }));
  }

  /**
   * A line whose goods all came back and were refunded in full nets out to
   * zero on every column — it would just be a row of zeros in the list, so it
   * is dropped. A partial return keeps its row: the retained amount is real
   * money the shop made.
   */
  private toSoldRows(rows: Record<string, unknown>[]): ItemRow[] {
    return rows
      .map((r) => ({
        date: (r.d as string | null) ?? null,
        name: String(r.name ?? ''),
        imei: (r.imei as string | null) ?? null,
        qty: num(r.qty),
        cost: num(r.cost),
        revenue: num(r.revenue),
        profit: num(r.profit),
      }))
      .filter((row) => row.qty !== 0 || row.revenue !== 0 || row.profit !== 0);
  }

  /* --- rendering ------------------------------------------------------------ */

  private render(
    wb: ExcelJS.Workbook,
    scope: ExportScope,
    from: string,
    to: string,
    sections: Section[],
  ): void {
    const ws = wb.addWorksheet('Hisobot');
    ws.columns = COLUMNS.map((c) => ({ width: c.width }));

    const title = ws.addRow(['Hisobot']);
    title.font = { bold: true, size: 14 };
    ws.addRow(['Bo‘lim', SCOPE_LABEL[scope]]);
    ws.addRow(['Davr', `${this.dmy(from)} — ${this.dmy(to)}`]);
    ws.addRow([]);

    for (const section of sections) {
      this.renderSection(ws, section);
    }

    // Only meaningful when more than one category is in the file.
    if (sections.length > 1) {
      const all = sections.flatMap((s) => [...s.sold, ...s.remaining]);
      this.addTotalRow(ws, 'UMUMIY JAMI', all, 'FFD9E2F3');
    }
  }

  private renderSection(ws: ExcelJS.Worksheet, section: Section): void {
    const heading = ws.addRow([section.title]);
    heading.font = { bold: true, size: 12 };

    const header = ws.addRow(COLUMNS.map((c) => c.header));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    header.height = 20;
    header.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2F5597' },
      };
    });

    if (!section.sold.length && !section.remaining.length) {
      const empty = ws.addRow(["Ma'lumot yo'q"]);
      empty.font = { italic: true, color: { argb: 'FF6B7280' } };
      ws.addRow([]);
      return;
    }

    // Label the two groups only when both are present — a single group needs
    // no explaining, the `Sotilmagan` column already says which one it is.
    const labelGroups = !!section.sold.length && !!section.remaining.length;

    if (labelGroups) this.addGroupLabel(ws, 'Sotilgan');
    section.sold.forEach((row) => this.addItemRow(ws, row));

    if (labelGroups) this.addGroupLabel(ws, 'Omborda qolgan');
    section.remaining.forEach((row) => this.addItemRow(ws, row));

    this.addTotalRow(
      ws,
      'JAMI',
      [...section.sold, ...section.remaining],
      'FFEFF3F8',
    );
    ws.addRow([]);
  }

  private addGroupLabel(ws: ExcelJS.Worksheet, label: string): void {
    const row = ws.addRow([label]);
    row.font = { bold: true, italic: true, color: { argb: 'FF6B7280' } };
  }

  private addItemRow(ws: ExcelJS.Worksheet, item: ItemRow): void {
    const row = ws.addRow([
      item.date ?? DASH,
      item.name,
      item.imei ?? '',
      item.qty,
      item.cost,
      item.revenue ?? UNSOLD,
      item.profit ?? DASH,
    ]);
    row.getCell(COL_QTY).numFmt = INT_FMT;
    row.getCell(COL_COST).numFmt = MONEY_FMT;
    if (item.revenue !== null) row.getCell(COL_REVENUE).numFmt = MONEY_FMT;
    if (item.profit !== null) row.getCell(COL_PROFIT).numFmt = MONEY_FMT;
    // Grey out the stock lines so the sold ones read as the main list.
    if (item.revenue === null) {
      row.getCell(COL_REVENUE).font = { color: { argb: 'FF6B7280' } };
      row.getCell(COL_PROFIT).font = { color: { argb: 'FF6B7280' } };
    }
  }

  /**
   * `Olingan narx` totals every line (sold + still in stock) — the money tied
   * up in goods; `Sotilgan narx` and `Foyda` only total the lines that
   * actually sold.
   */
  private addTotalRow(
    ws: ExcelJS.Worksheet,
    label: string,
    items: ItemRow[],
    fill: string,
  ): void {
    const sum = (pick: (i: ItemRow) => number | null) =>
      items.reduce((acc, i) => acc + (pick(i) ?? 0), 0);

    const row = ws.addRow([
      label,
      '',
      '',
      sum((i) => i.qty),
      sum((i) => i.cost),
      sum((i) => i.revenue),
      sum((i) => i.profit),
    ]);
    row.font = { bold: true };
    row.getCell(COL_QTY).numFmt = INT_FMT;
    row.getCell(COL_COST).numFmt = MONEY_FMT;
    row.getCell(COL_REVENUE).numFmt = MONEY_FMT;
    row.getCell(COL_PROFIT).numFmt = MONEY_FMT;
    for (let i = 1; i <= COLUMNS.length; i += 1) {
      row.getCell(i).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fill },
      };
    }
  }

  /** `2026-09-01` -> `01.09.2026`, for the human-readable range line. */
  private dmy(isoDate: string): string {
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}.${y}`;
  }
}
