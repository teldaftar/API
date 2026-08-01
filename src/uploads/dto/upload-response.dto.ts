import { ApiProperty } from '@nestjs/swagger';

export class UploadResponseDto {
  @ApiProperty({ example: '/uploads/abc123.webp' })
  url: string;

  @ApiProperty({ example: 'abc123.webp' })
  key: string;
}
