/** Phụ thu cộng vào giá gốc (VND). */
export interface PricedOption {
  name: string;
  price: number;
}

export interface ProductSummaryDto {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
}

export interface ProductDetailDto extends ProductSummaryDto {
  stock: number;
  sizes: PricedOption[];
  toppings: PricedOption[];
}
