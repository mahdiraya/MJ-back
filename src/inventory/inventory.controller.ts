import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { InventoryService } from './inventory.service';
import { ReturnsService } from '../returns/returns.service';
import {
  AssignBarcodeDto,
  ListInventoryUnitsDto,
  ReturnInventoryUnitDto,
} from './dto/list-inventory-units.dto';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly returns: ReturnsService,
  ) {}

  @Get('items/:itemId/units')
  listUnits(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Query() query: ListInventoryUnitsDto,
  ) {
    return this.inventory.listUnitsForItem(itemId, query);
  }

  @Get('barcodes/:barcode')
  lookup(@Param('barcode') barcode: string) {
    return this.inventory.lookupByBarcode(barcode);
  }

  @Patch('units/:unitId/barcode')
  assignBarcode(
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: AssignBarcodeDto,
  ) {
    return this.inventory.assignBarcode(unitId, dto.barcode);
  }

  @Post('units/:unitId/return')
  returnUnit(
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: ReturnInventoryUnitDto,
  ) {
    return this.returns.requestReturn(unitId, {
      requestedOutcome: dto.outcome,
      note: dto.note,
    });
  }

  @Get('units/:unitId/history')
  history(@Param('unitId', ParseIntPipe) unitId: number) {
    return this.inventory.getUnitHistory(unitId);
  }
}
