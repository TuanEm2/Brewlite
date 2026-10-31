import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    controller = module.get<AppController>(AppController);
  });

  it('GET /api: returns hello', () => {
    expect(controller.getHello()).toBe('Hello BrewLite from NestJS!');
  });

  it('GET /api/health: reports ok', () => {
    const health = controller.getHealth();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('BrewLite API');
    expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
  });
});
