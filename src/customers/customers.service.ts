import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Customer } from '../entities/customer.entity';
import { Repository } from 'typeorm';
import { BaseService } from '../base/base.service';

@Injectable()
export class CustomersService extends BaseService<Customer> {
  constructor(@InjectRepository(Customer) repo: Repository<Customer>) {
    super(repo);
  }
}
