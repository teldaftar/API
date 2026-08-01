import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentShop } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ShopResponseDto } from './dto/shop-response.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ShopService } from './shop.service';

@ApiTags('shop')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get()
  @ApiOperation({ summary: 'Get own shop settings' })
  @ApiOkResponse({ type: ShopResponseDto })
  async get(@CurrentShop() shopId: string): Promise<ShopResponseDto> {
    return ShopResponseDto.from(await this.shopService.findForShop(shopId));
  }

  @Patch()
  @ApiOperation({ summary: 'Update shop settings' })
  @ApiOkResponse({ type: ShopResponseDto })
  async update(
    @CurrentShop() shopId: string,
    @Body() dto: UpdateShopDto,
  ): Promise<ShopResponseDto> {
    return ShopResponseDto.from(await this.shopService.update(shopId, dto));
  }
}
