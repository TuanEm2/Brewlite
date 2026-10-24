import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const SIZE_NAMES = ['S', 'M', 'L'] as const;
export type SizeName = (typeof SIZE_NAMES)[number];

export const MAX_QUANTITY_PER_LINE = 99;
export const MAX_LINES_PER_ORDER = 50;

/**
 * Một dòng giỏ hàng gửi lên, đúng hợp đồng TV2 ghi trong bàn giao Task 5:
 * chỉ gồm productId, tên size, tên topping và số lượng. Không có giá: server tự tính.
 */
export class CreateOrderItemDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId!: number;

  @IsIn(SIZE_NAMES)
  size!: SizeName;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  toppings!: string[];

  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PER_LINE)
  quantity!: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LINES_PER_ORDER)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  /** Cùng khóa khi retry cùng giỏ hàng để tránh tạo đơn trùng. */
  @IsOptional()
  @IsUUID('4')
  idempotencyKey?: string;
}
