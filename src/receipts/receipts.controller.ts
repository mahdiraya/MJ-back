import { Controller, Get, Query } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get('history')
  async history(@Query('limit') limit?: string) {
    const n = Math.max(1, Math.min(1000, Number(limit) || 200));
    return this.receipts.listUnified(n);
  }
}
