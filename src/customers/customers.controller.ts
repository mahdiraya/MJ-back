import { Controller, UseGuards, Delete, Param, Get, ParseIntPipe } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { BaseController } from '../base/base.controller';
import { Customer } from '../entities/customer.entity';
import { CreateCustomerDto } from './create-customer.dto';
import { UpdateCustomerDto } from './update-customer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TransactionsService } from '../transactions/transactions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController extends BaseController<
  Customer,
  CreateCustomerDto,
  UpdateCustomerDto
> {
  constructor(
    private readonly customersService: CustomersService,
    private readonly transactionsService: TransactionsService,
  ) {
    super(customersService);
  }

  @Get('with-sales')
  listWithSales() {
    return this.customersService.findWithSales();
  }

  @Get(':id/receipts')
  listCustomerReceipts(@Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.listMovements({ customerId: id });
  }

  // Only manager/admin can delete customers
  @Roles('manager', 'admin')
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.service.delete(id);
  }
}
