import { PartialType } from '@nestjs/swagger';
import { CreateCreditorDto } from './create-creditor.dto';

export class UpdateCreditorDto extends PartialType(CreateCreditorDto) {}
