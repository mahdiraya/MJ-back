import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { ReturnsService, CreateReturnDto, ResolveReturnDto } from './returns.service';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  list() {
    return this.returnsService.listReturns();
  }

  @Post(':unitId')
  requestReturn(
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: CreateReturnDto,
  ) {
    return this.returnsService.requestReturn(unitId, dto);
  }

  @Patch(':id')
  resolve(@Param('id', ParseIntPipe) id: number, @Body() dto: ResolveReturnDto) {
    return this.returnsService.resolveReturn(id, dto);
  }
}
