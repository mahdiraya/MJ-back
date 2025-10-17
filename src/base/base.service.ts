import { Repository, ObjectLiteral } from 'typeorm';

export class BaseService<T extends ObjectLiteral> {
  constructor(protected readonly repo: Repository<T>) {}

  async findAll(): Promise<T[]> {
    return this.repo.find();
  }

  async findOne(id: number): Promise<T | null> {
    return this.repo.findOne({ where: { id } as any });
  }

  async create(data: Partial<T>): Promise<T> {
    return this.repo.save(data as any);
  }

  async update(id: number, data: Partial<T>): Promise<T> {
    await this.repo.update(id, data as any);
    return this.findOne(id) as Promise<T>;
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
