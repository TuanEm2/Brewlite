import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello BrewLite from NestJS!';
  }

  getHealth(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'BrewLite API',
      timestamp: new Date().toISOString(),
    };
  }
}
