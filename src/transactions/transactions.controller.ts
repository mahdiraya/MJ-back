import {
  Controller,
  UseGuards,
  Delete,
  Param,
  Post,
  Body,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { BaseController } from '../base/base.controller';
import { Transaction } from '../entities/transaction.entity';
import { CreateTransactionDto } from './create-transaction.dto';
import { UpdateTransactionDto } from './update-transaction.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController extends BaseController<
  Transaction,
  CreateTransactionDto,
  UpdateTransactionDto
> {
  constructor(private readonly transactionsService: TransactionsService) {
    super(transactionsService);
  }

  /** Override default list: include user & customer so UI can display names */
  @Get()
  override findAll() {
    return this.transactionsService.findAllWithPeople();
  }

  @Roles('manager', 'admin')
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }

  @Post()
  override create(@Body() dto: CreateTransactionDto) {
    return this.transactionsService.createTransaction(dto);
  }

  @Get(':id/receipt')
  getReceipt(@Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.getReceipt(id);
  }

  @Get('receipt/:id')
  getReceiptAlt(@Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.getReceipt(id);
  }

  /** Lightweight history endpoints (no items), newest first */
  @Get('history')
  getHistory(@Query('limit') limit?: string) {
    const n = Math.max(1, Math.min(1000, Number(limit) || 200));
    return this.transactionsService.listRecent(n);
  }

  /** Alias for clients that call /transactions/recent */
  @Get('recent')
  getRecent(@Query('limit') limit?: string) {
    const n = Math.max(1, Math.min(1000, Number(limit) || 200));
    return this.transactionsService.listRecent(n);
  }
}
