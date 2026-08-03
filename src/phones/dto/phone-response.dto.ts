import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SaleDebtSummaryDto } from '../../sales/dto/sale-response.dto';
import { Phone, PhoneCondition, PhoneStatus } from '../entities/phone.entity';

export class PhoneResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) imei: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: "Supplier's first name — who the shop bought the phone from.",
  })
  supplierName: string | null;
  @ApiPropertyOptional({ nullable: true, description: "Supplier's surname." })
  supplierSurname: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Supplier phone number for follow-up contact.',
  })
  supplierPhone: string | null;
  @ApiProperty({ description: 'What the shop paid (olingan narx)' })
  purchasePrice: number;
  @ApiPropertyOptional({ nullable: true }) listPrice: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Actual sold price (sotilgan narx) for a SOLD phone, from its sale; null while IN_STOCK',
  })
  salePrice: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'salePrice - purchasePrice for a SOLD phone; null otherwise',
  })
  profit: number | null;
  @ApiPropertyOptional({ enum: PhoneCondition, nullable: true })
  condition: PhoneCondition | null;
  @ApiPropertyOptional({ nullable: true }) ramGb: number | null;
  @ApiPropertyOptional({ nullable: true }) storageGb: number | null;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) note: string | null;
  @ApiProperty({ enum: PhoneStatus }) status: PhoneStatus;

  @ApiPropertyOptional({
    type: SaleDebtSummaryDto,
    nullable: true,
    description:
      'Debt info when the phone was sold on debt; null otherwise. Shows original amount, remaining balance and the payment history.',
  })
  debt: SaleDebtSummaryDto | null;

  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  static from(
    phone: Phone,
    salePrice: number | null = null,
    debt: SaleDebtSummaryDto | null = null,
  ): PhoneResponseDto {
    return {
      id: phone.id,
      name: phone.name,
      imei: phone.imei,
      supplierName: phone.supplierName,
      supplierSurname: phone.supplierSurname,
      supplierPhone: phone.supplierPhone,
      purchasePrice: phone.purchasePrice,
      listPrice: phone.listPrice,
      salePrice,
      profit:
        salePrice !== null
          ? Math.round((salePrice - phone.purchasePrice + Number.EPSILON) * 100) /
            100
          : null,
      condition: phone.condition,
      ramGb: phone.ramGb,
      storageGb: phone.storageGb,
      imageUrl: phone.imageUrl,
      note: phone.note,
      status: phone.status,
      debt,
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
  @ApiPropertyOptional({ nullable: true }) imei: string | null;
  @ApiPropertyOptional({ nullable: true }) labelFooter: string | null;
}
