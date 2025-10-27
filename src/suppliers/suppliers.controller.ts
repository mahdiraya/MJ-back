import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RecordSupplierPaymentDto } from './dto/record-supplier-payment.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  @Get()
  getAll() {
    return this.svc.findAll();
  }

  @Get('debt/overview')
  debtOverview() {
    return this.svc.getDebtOverview();
  }

  @Get('debt/:id')
  debtDetail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getSupplierDebtDetail(id);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Roles('manager', 'admin')
  @Post()
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Roles('manager', 'admin')
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.update(id, body);
  }

  @Roles('manager', 'admin')
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.svc.delete(id);
  }

  @Roles('manager', 'admin')
  @Post('debt/:id/payments')
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RecordSupplierPaymentDto,
  ) {
    return this.svc.recordSupplierPayment(id, body);
  }
}
