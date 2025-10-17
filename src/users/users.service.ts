import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { BaseService } from '../base/base.service';

type NewUserBody = {
  username: string;
  password: string;
  name: string;
  role: 'cashier' | 'manager' | 'admin';
};

type UpdateUserBody = Partial<{
  username: string;
  password: string;
  name: string;
  role: 'cashier' | 'manager' | 'admin';
}>;

@Injectable()
export class UsersService extends BaseService<User> {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {
    super(usersRepo);
  }

  /** Create user with hashed password. Returns sanitized user. */
  async createUser(body: NewUserBody): Promise<User> {
    const password_hash = await bcrypt.hash(body.password, 10);
    const user = this.usersRepo.create({
      username: body.username,
      password_hash,
      name: body.name,
      role: body.role,
    });
    const saved = await this.usersRepo.save(user);
    return this.sanitize(saved);
  }

  /** Update user; if password provided, hash it. Returns sanitized user. */
  async updateUser(id: number, body: UpdateUserBody): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (body.username !== undefined) user.username = body.username;
    if (body.name !== undefined) user.name = body.name;
    if (body.role !== undefined) user.role = body.role as any;

    if (typeof body.password === 'string' && body.password.length > 0) {
      user.password_hash = await bcrypt.hash(body.password, 10);
    }

    const saved = await this.usersRepo.save(user);
    return this.sanitize(saved);
  }

  /** For auth: return full entity (including password_hash). */
  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { username } });
  }

  /** Keep BaseService signatures, but only select safe fields and sanitize. */
  override async findAll(): Promise<User[]> {
    const rows = await this.usersRepo.find({
      select: ['id', 'username', 'name', 'role'] as any,
      order: { id: 'ASC' },
    });
    // Cast back to User[] to satisfy BaseService<User> typing
    return rows.map((u) => this.sanitize(u));
  }

  override async findOne(id: number): Promise<User | null> {
    const u = await this.usersRepo.findOne({
      where: { id },
      select: ['id', 'username', 'name', 'role'] as any,
    });
    return u ? this.sanitize(u) : null;
  }

  /** Strip sensitive fields; keep shape compatible at compile-time. */
  private sanitize(u: User): User {
    const { id, username, name, role } = u as any;
    // Return only safe props; cast to User to match BaseService signatures
    return { id, username, name, role } as unknown as User;
  }
}
