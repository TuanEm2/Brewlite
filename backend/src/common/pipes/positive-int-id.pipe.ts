import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const MAX_INT32 = 2147483647;

/** Chỉ nhận số nguyên dương vừa kiểu Int của PostgreSQL; còn lại trả 400. */
@Injectable()
export class PositiveIntIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('id phải là số nguyên dương');
    }
    const id = Number(value);
    if (id < 1 || id > MAX_INT32) {
      throw new BadRequestException('id nằm ngoài phạm vi cho phép');
    }
    return id;
  }
}
