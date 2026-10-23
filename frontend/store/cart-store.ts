"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  MAX_CART_QUANTITY,
  cartKey,
  normalizeToppings,
  unitPrice,
  type AddToCartInput,
  type CartItem,
} from "./cart-utils";

export type AddToCartResult = { added: boolean; message: string };

export type CartState = {
  items: CartItem[];
  addItem: (input: AddToCartInput) => AddToCartResult;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const validMoney = (value: number) => Number.isSafeInteger(value) && value >= 0;

/**
 * Prices in this store are display-only snapshots. Task 6 must revalidate the
 * products, size, toppings, stock and amounts with NestJS before creating orders.
 */
export const useCartStore = create<CartState>()(
  persist<CartState, [], [], Pick<CartState, "items">>(
    (set) => ({
      items: [],
      addItem: (input) => {
        if (
          !Number.isSafeInteger(input.productId) || input.productId < 1 ||
          !validMoney(input.basePrice) || !Number.isSafeInteger(input.stock) || input.stock < 1 ||
          !input.name.trim() || !input.size?.name || !validMoney(input.size.price) ||
          !Array.isArray(input.toppings) ||
          input.toppings.some((t) => !t.name || !validMoney(t.price))
        ) {
          return { added: false, message: "Sản phẩm hoặc lựa chọn không hợp lệ." };
        }
        const amount = input.quantity ?? 1;
        if (!Number.isSafeInteger(amount) || amount < 1) {
          return { added: false, message: "Số lượng phải là số nguyên dương." };
        }
        const toppings = normalizeToppings(input.toppings);
        const key = cartKey(input.productId, input.size.name, toppings);
        const price = unitPrice(input.basePrice, input.size, toppings);
        if (!validMoney(price)) {
          return { added: false, message: "Giá sản phẩm không hợp lệ." };
        }

        let result: AddToCartResult = { added: false, message: "Không thể thêm vào giỏ." };
        set((state) => {
          const existing = state.items.find((item) => item.key === key);
          const maxQuantity = Math.min(input.stock, MAX_CART_QUANTITY);
          if (existing) {
            const nextQty = Math.min(existing.quantity + amount, maxQuantity);
            if (nextQty <= existing.quantity) {
              result = { added: false, message: "Đã đạt số lượng còn lại của sản phẩm." };
              return state;
            }
            result = { added: true, message: "Đã cập nhật số lượng trong giỏ hàng!" };
            return {
              items: state.items.map((item) => item.key === key ? {
                ...item,
                quantity: nextQty,
                maxQuantity,
                basePrice: input.basePrice,
                unitPrice: price,
              } : item),
            };
          }
          result = { added: true, message: "Đã thêm đồ uống vào giỏ hàng!" };
          return {
            items: [...state.items, {
              key,
              productId: input.productId,
              name: input.name,
              imageUrl: input.imageUrl,
              basePrice: input.basePrice,
              size: input.size,
              toppings,
              unitPrice: price,
              quantity: Math.min(amount, maxQuantity),
              maxQuantity,
            }],
          };
        });
        return result;
      },
      setQuantity: (key, quantity) => set((state) => {
        if (!Number.isSafeInteger(quantity)) return state;
        if (quantity <= 0) return { items: state.items.filter((item) => item.key !== key) };
        return {
          items: state.items.map((item) => item.key === key
            ? { ...item, quantity: Math.min(quantity, item.maxQuantity, MAX_CART_QUANTITY) }
            : item),
        };
      }),
      removeItem: (key) => set((state) => ({ items: state.items.filter((item) => item.key !== key) })),
      clearCart: () => set({ items: [] }),
    }),
    {
      name: "brewlite-cart-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
