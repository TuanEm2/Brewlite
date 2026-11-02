"use client";

import { useEffect, useState } from "react";

export type IngredientAvailabilityResponse = {
  productId: number;
  size: string;
  toppings: string[];
  configured: boolean;
  maxCups: number | null;
  ingredients: Array<{
    id: number;
    name: string;
    unit: "G" | "ML" | "PIECE";
    available: number;
    requiredForOne: number;
    maxCups: number;
  }>;
};

type Props = {
  productId: number;
  size: string;
  toppings: string[];
  quantity?: number;
  onCapacityChange?: (capacity: number | null) => void;
};

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");
const number = (value: number) => new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 3,
}).format(value);
const unitLabel = { G: "g", ML: "ml", PIECE: "cái" } as const;

/**
 * TV4: hiển thị kho nguyên liệu theo công thức cho đúng size/topping.
 * Đây là ảnh chụp tồn kho tại thời điểm GET, không thay thế kiểm tra
 * nguyên liệu đồng thời trong OrdersService.createPending().
 */
export function IngredientAvailability({
  productId, size, toppings, quantity = 1, onCapacityChange,
}: Props) {
  const [value, setValue] = useState<IngredientAvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Key giữ yêu cầu không chạy lại nếu parent chỉ tạo mảng toppings mới.
  const toppingKey = JSON.stringify([...toppings].sort());

  useEffect(() => {
    const controller = new AbortController();
    if (!size || productId < 1) {
      setValue(null);
      onCapacityChange?.(null);
      return () => controller.abort();
    }
    const search = new URLSearchParams({ size });
    const parsed = JSON.parse(toppingKey) as string[];
    parsed.forEach((name) => search.append("topping", name));
    setLoading(true);
    setValue(null);
    setError("");
    onCapacityChange?.(null);
    void fetch(`${API}/products/${productId}/availability?${search.toString()}`, {
      signal: controller.signal, cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Không lấy được tồn kho nguyên liệu.");
      return response.json() as Promise<IngredientAvailabilityResponse>;
    }).then((data) => {
      if (controller.signal.aborted) return;
      setValue(data);
      onCapacityChange?.(data.configured ? data.maxCups : null);
    }).catch(() => {
      if (!controller.signal.aborted) {
        setError("Không thể kiểm tra tồn nguyên liệu lúc này.");
        onCapacityChange?.(null);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [productId, size, toppingKey, onCapacityChange]);

  return (
    <section className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"
      aria-label="Tồn kho nguyên liệu" aria-live="polite">
      <p className="font-bold text-amber-950">Tồn nguyên liệu theo lựa chọn</p>
      {loading && <p className="mt-1 text-gray-600">Đang kiểm tra tồn kho...</p>}
      {error && <p className="mt-1 text-red-700">{error} Backend sẽ kiểm tra lại khi đặt hàng.</p>}
      {!loading && value && !value.configured &&
        <p className="mt-1 text-amber-900">Món này chưa có công thức nguyên liệu trong database; chưa thể ước tính số ly.</p>}
      {!loading && value?.configured && (
        <>
          <p className={`mt-1 font-semibold ${value.maxCups === 0 ? "text-red-700" : "text-green-800"}`}>
            {value.maxCups === 0
              ? "Đã hết ít nhất một nguyên liệu cần dùng"
              : `Ước tính còn đủ nguyên liệu pha ${number(value.maxCups ?? 0)} ly`}
          </p>
          {quantity > (value.maxCups ?? 0) &&
            <p className="mt-1 font-semibold text-red-700">
              Giỏ đang chọn {number(quantity)} ly, vượt lượng nguyên liệu hiện có.
            </p>}
          <ul className="mt-2 space-y-1 text-gray-700">
            {value.ingredients.map((item) => (
              <li key={item.id}>
                • {item.name}: còn {number(item.available)} {unitLabel[item.unit] ?? item.unit};
                cần {number(item.requiredForOne)} {unitLabel[item.unit] ?? item.unit}/ly
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            Tồn kho có thể đổi khi khách khác đặt hàng. Các món cùng giỏ có thể dùng chung nguyên liệu;
            Backend luôn kiểm tra tổng lượng và trừ kho bằng transaction khi tạo đơn.
          </p>
        </>
      )}
    </section>
  );
}
