import {
  Controller,
  UseGuards,
  Post,
  Body,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RestocksService } from './restocks.service';
import { CreateRestockDto } from './create-restock.dto';
import { RestockMovementsQueryDto } from './dto/restock-movements.query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('restocks')
export class RestocksController {
  constructor(private readonly service: RestocksService) {}

  @Get('movements')
  listMovements(@Query() query: RestockMovementsQueryDto) {
    return this.service.listMovements(query);
  }

  @Roles('manager', 'admin')
  @Post()
  create(@Body() dto: CreateRestockDto) {
    return this.service.createRestock(dto);
  }

  // Optional helpers
  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    // Implement findOne if needed later
    return { id };
  }

  @Get(':id/receipt')
  getReceipt(@Param('id', ParseIntPipe) id: number) {
    return this.service.getReceipt(id);
  }
}
