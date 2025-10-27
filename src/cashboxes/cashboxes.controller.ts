import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CashboxesService } from './cashboxes.service';
import { CreateManualCashboxEntryDto } from './dto/create-manual-entry.dto';
import { ManualEntryQueryDto } from './dto/manual-entry-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cashboxes')
export class CashboxesController {
  constructor(private readonly service: CashboxesService) {}

  @Get()
  findAll() {
    return this.service.listCashboxes();
  }

  @Get('manual')
  listManual(@Query() query: ManualEntryQueryDto) {
    return this.service.listManualEntries(query);
  }

  @Roles('manager', 'admin')
  @Post('manual')
  createManual(@Body() dto: CreateManualCashboxEntryDto) {
    return this.service.createManualEntry(dto);
  }
}
