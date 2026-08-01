import { PartialType } from '@nestjs/swagger';
import { CreatePhoneDto } from './create-phone.dto';

/**
 * All fields optional. The service enforces that once a phone is SOLD only
 * `note` / `imageUrl` may change.
 */
export class UpdatePhoneDto extends PartialType(CreatePhoneDto) {}
