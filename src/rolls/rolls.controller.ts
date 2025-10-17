import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RollsService } from './rolls.service';
import { CreateRollDto } from './create-roll.dto';
import { Roll } from '../entities/roll.entity';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rolls')
export class RollsController {
  constructor(private readonly rolls: RollsService) {}

  @Roles('manager', 'admin')
  @Post()
  create(@Body() dto: CreateRollDto): Promise<Roll> {
    return this.rolls.createRoll(dto);
  }

  @Get('item/:itemId')
  listByItem(@Param('itemId', ParseIntPipe) itemId: number): Promise<Roll[]> {
    return this.rolls.listByItem(itemId);
  }

  @Roles('manager', 'admin')
  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.rolls.deleteRoll(id);
    return { success: true };
  }
}
