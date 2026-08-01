import { ApiProperty } from '@nestjs/swagger';

export class TokenPairDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ description: 'Access token TTL in seconds' })
  expiresIn: number;
}

export class MeUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  login: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  isActive: boolean;
}

export class MeShopDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  address: string | null;

  @ApiProperty({ nullable: true })
  phone: string | null;

  @ApiProperty({ nullable: true })
  labelFooter: string | null;
}

export class MeResponseDto {
  @ApiProperty({ type: MeUserDto })
  user: MeUserDto;

  @ApiProperty({ type: MeShopDto })
  shop: MeShopDto;
}
