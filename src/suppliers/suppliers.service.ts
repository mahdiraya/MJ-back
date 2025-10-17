import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Supplier } from '../entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(@InjectRepository(Supplier) private repo: Repository<Supplier>) {}

  findAll() {
    return this.repo.find({ order: { id: 'DESC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }

  async create(data: DeepPartial<Supplier>) {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: number, data: DeepPartial<Supplier>) {
    const existing = await this.repo.findOneBy({ id });
    if (!existing) throw new NotFoundException('Supplier not found');
    Object.assign(existing, data);
    return this.repo.save(existing);
  }

  async delete(id: number) {
    await this.repo.delete(id);
    return { success: true };
  }
}
