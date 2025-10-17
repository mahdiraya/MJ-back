import { Test, TestingModule } from '@nestjs/testing';
import { TransactionItemsController } from './transaction-items.controller';

describe('TransactionItemsController', () => {
  let controller: TransactionItemsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionItemsController],
    }).compile();

    controller = module.get<TransactionItemsController>(TransactionItemsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
