import { PartialType } from '@nestjs/swagger';
import { CreateDebtBookEntryDto } from './create-debt-book-entry.dto';

export class UpdateDebtBookEntryDto extends PartialType(
  CreateDebtBookEntryDto,
) {}
