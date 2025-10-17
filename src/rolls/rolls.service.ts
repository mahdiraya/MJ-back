import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '../base/base.service';
import { Roll } from '../entities/roll.entity';
import { Item } from '../entities/item.entity';
import { CreateRollDto } from './create-roll.dto';

@Injectable()
export class RollsService extends BaseService<Roll> {
  constructor(
    @InjectRepository(Roll) private rollsRepo: Repository<Roll>,
    @InjectRepository(Item) private itemsRepo: Repository<Item>,
  ) {
    super(rollsRepo);
  }

  async createRoll(dto: CreateRollDto): Promise<Roll> {
    const item = await this.itemsRepo.findOneBy({ id: dto.itemId });
    if (!item) throw new BadRequestException('Item not found');
    if (item.stockUnit !== 'm') {
      throw new BadRequestException('Cannot add rolls to a non-meter item');
    }
    const len = Number(dto.length_m.toFixed(3));
    const roll = this.rollsRepo.create({
      item: { id: item.id } as any,
      length_m: len,
      remaining_m: len,
    });
    const saved = await this.rollsRepo.save(roll);

    // increment item total meters
    item.stock = Number((Number(item.stock) + len).toFixed(3));
    await this.itemsRepo.save(item);

    return this.rollsRepo.findOneOrFail({
      where: { id: saved.id },
      relations: ['item'],
    });
  }

  async deleteRoll(id: number): Promise<void> {
    const roll = await this.rollsRepo.findOne({
      where: { id },
      relations: ['item'],
    });
    if (!roll) return;
    const item = roll.item;
    // subtract ONLY remaining_m from item.stock
    item.stock = Number(
      (Number(item.stock) - Number(roll.remaining_m)).toFixed(3),
    );
    if (item.stock < 0) item.stock = 0;
    await this.itemsRepo.save(item);
    await this.rollsRepo.delete(id);
  }

  async listByItem(itemId: number): Promise<Roll[]> {
    return this.rollsRepo.find({
      where: { item: { id: itemId } },
      order: { id: 'ASC' },
    });
  }
}
