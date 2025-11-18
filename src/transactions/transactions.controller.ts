import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { BaseController } from '../base/base.controller';
import { Transaction } from '../entities/transaction.entity';
import { CreateTransactionDto } from './create-transaction.dto';
import { UpdateTransactionDto } from './update-transaction.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TransactionMovementsQueryDto } from './dto/transaction-movements.query.dto';

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

  @Get('movements')
  listMovements(@Query() query: TransactionMovementsQueryDto) {
    return this.transactionsService.listMovements(query);
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

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.updateTransaction(id, dto);
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
