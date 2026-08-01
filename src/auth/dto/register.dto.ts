import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: "Aziz Mobile", description: "Do'kon nomi" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  shopName: string;

  @ApiProperty({ example: 'Abdulaziz Karimov' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName: string;

  @ApiProperty({
    example: 'aziz.mobile',
    description: '3–32 chars, letters/digits/._- only, globally unique',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'login may only contain letters, digits and . _ -',
  })
  login: string;

  @ApiProperty({ minLength: 8, example: 'supersecret' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ minLength: 8, example: 'supersecret' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword: string;

  @ApiPropertyOptional({
    description: 'Required only when the server sets INVITE_CODE',
  })
  @IsOptional()
  @IsString()
  inviteCode?: string;
}
