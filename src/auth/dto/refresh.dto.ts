import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'The raw refresh token issued at login/refresh' })
  @IsString()
  @MinLength(10)
  refreshToken: string;
}

export class LogoutDto {
  @ApiProperty({ description: 'The refresh token to revoke' })
  @IsString()
  @MinLength(10)
  refreshToken: string;
}
