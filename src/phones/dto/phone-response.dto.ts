import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Phone, PhoneCondition, PhoneStatus } from '../entities/phone.entity';

export class PhoneResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() imei: string;
  @ApiProperty() purchasePrice: number;
  @ApiPropertyOptional({ nullable: true }) listPrice: number | null;
  @ApiPropertyOptional({ enum: PhoneCondition, nullable: true })
  condition: PhoneCondition | null;
  @ApiPropertyOptional({ nullable: true }) ramGb: number | null;
  @ApiPropertyOptional({ nullable: true }) storageGb: number | null;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty({ enum: PhoneStatus }) status: PhoneStatus;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  static from(phone: Phone): PhoneResponseDto {
    return {
      id: phone.id,
      name: phone.name,
      imei: phone.imei,
      purchasePrice: phone.purchasePrice,
      listPrice: phone.listPrice,
      condition: phone.condition,
      ramGb: phone.ramGb,
      storageGb: phone.storageGb,
      imageUrl: phone.imageUrl,
      note: phone.note,
      status: phone.status,
      createdAt: phone.createdAt,
      updatedAt: phone.updatedAt,
    };
  }
}

export class PhoneLabelDto {
  @ApiProperty() shopName: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({
    nullable: true,
    example: '8 GB / 256 GB',
    description: 'Omitted when both ram and storage are null',
  })
  memory: string | null;
  @ApiPropertyOptional({ nullable: true }) condition: string | null;
  @ApiProperty() imei: string;
  @ApiPropertyOptional({ nullable: true }) labelFooter: string | null;
}
