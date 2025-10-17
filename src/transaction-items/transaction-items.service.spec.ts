import { Test, TestingModule } from '@nestjs/testing';
import { TransactionItemsService } from './transaction-items.service';

describe('TransactionItemsService', () => {
  let service: TransactionItemsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionItemsService],
    }).compile();

    service = module.get<TransactionItemsService>(TransactionItemsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
