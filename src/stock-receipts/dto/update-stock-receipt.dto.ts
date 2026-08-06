import { CreateStockReceiptDto } from './create-stock-receipt.dto';

/**
 * Editing a receipt fully replaces its line set (same shape/rules as create):
 * `items` is required and must have at least one line. Removing every line is
 * not an edit — delete the receipt instead.
 */
export class UpdateStockReceiptDto extends CreateStockReceiptDto {}
