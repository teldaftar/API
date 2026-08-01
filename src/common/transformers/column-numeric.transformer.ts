import { ValueTransformer } from 'typeorm';

/**
 * Ensures numeric(14,2) money columns are read as JS `number` instead of the
 * string that node-postgres returns for the numeric type. Writes pass through
 * unchanged so TypeORM/pg can serialize them.
 */
export class ColumnNumericTransformer implements ValueTransformer {
  to(value: number | null): number | null {
    return value;
  }

  from(value: string | null): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return parseFloat(value);
  }
}

export const numericTransformer = new ColumnNumericTransformer();
