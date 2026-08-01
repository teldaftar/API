import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'aziz.mobile' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  login: string;

  @ApiProperty({ example: 'supersecret' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
