import { BadRequestException } from '@nestjs/common';
import { PositiveIntIdPipe } from './positive-int-id.pipe';

describe('PositiveIntIdPipe', () => {
  const pipe = new PositiveIntIdPipe();

  it.each([
    ['1', 1],
    ['42', 42],
    ['2147483647', 2147483647],
  ])('chấp nhận %s', (input, expected) => {
    expect(pipe.transform(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.5', '0', '-1', '+1', ' 1', '1abc', '2147483648'])(
    'trả 400 với %p',
    (input) => {
      expect(() => pipe.transform(input)).toThrow(BadRequestException);
    },
  );
});
