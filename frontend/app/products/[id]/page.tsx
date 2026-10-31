"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCartStore } from "../../../store/cart-store";
import { cartCount } from "../../../store/cart-utils";

type PricedOption = {
  name: string;
  price: number;
};

type ProductDetail = {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  stock: number;
  sizes: PricedOption[];
  toppings: PricedOption[];
};

const apiUrl = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
).replace(/\/+$/, "");

const money = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const [cartNotice, setCartNotice] = useState("");
  const [cartNoticeAdded, setCartNoticeAdded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const addItem = useCartStore((state) => state.addItem);
  const cartQuantity = useCartStore((state) => cartCount(state.items));

  useEffect(() => setMounted(true), []);

  function addSelectedProduct() {
    if (!product || product.stock <= 0) return;
    const size = product.sizes.find((option) => option.name === selectedSize);
    if (!size) return;

    const result = addItem({
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      basePrice: product.price,
      stock: product.stock,
      size,
      toppings: product.toppings.filter((topping) =>
        selectedToppings.includes(topping.name)
      ),
      quantity: 1,
    });
    setCartNotice(result.message);
    setCartNoticeAdded(result.added);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadProduct() {
      setLoading(true);
      setError(null);
      setProduct(null);
      setSelectedSize("");
      setSelectedToppings([]);
      setCartNotice("");
      setCartNoticeAdded(false);

      try {
        const response = await fetch(
          `${apiUrl}/products/${encodeURIComponent(id)}`,
          { signal: controller.signal, cache: "no-store" }
        );

        if (response.status === 404) {
          throw new Error("Sản phẩm không tồn tại.");
        }

        if (response.status === 400) {
          throw new Error("Mã sản phẩm không hợp lệ.");
        }

        if (!response.ok) {
          throw new Error("Không thể tải sản phẩm. Vui lòng thử lại.");
        }

        const data: ProductDetail = await response.json();

        if (controller.signal.aborted) return;

        setProduct(data);
        setSelectedSize(
          data.sizes.find((size) => size.name === "S")?.name ??
            data.sizes[0]?.name ??
            ""
        );
      } catch (err: unknown) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof TypeError
            ? "Không kết nối được API. Kiểm tra backend và thử lại."
            : err instanceof Error
              ? err.message
              : "Đã có lỗi xảy ra."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadProduct();

    // Hủy yêu cầu cũ khi rời trang hoặc chuyển sang sản phẩm khác.
    return () => controller.abort();
  }, [id, retry]);

  function toggleTopping(name: string) {
    setSelectedToppings((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    );
  }

  const sizePrice =
    product?.sizes.find((size) => size.name === selectedSize)?.price ?? 0;

  const toppingPrice =
    product?.toppings
      .filter((topping) => selectedToppings.includes(topping.name))
      .reduce((sum, topping) => sum + topping.price, 0) ?? 0;

  const total = (product?.price ?? 0) + sizePrice + toppingPrice;

  return (
    <main className="min-h-screen bg-amber-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/menu"
          className="font-semibold text-amber-900 hover:underline"
        >
          ← Quay lại menu
        </Link>

        {loading && (
          <p role="status" className="mt-8 text-amber-900">
            Đang tải thông tin đồ uống...
          </p>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6"
          >
            <p className="text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => setRetry((current) => current + 1)}
              className="mt-4 rounded-lg bg-amber-800 px-4 py-2 text-white"
            >
              Thử lại
            </button>
          </div>
        )}

        {!loading && !error && product && (
          <article className="mt-6 grid gap-8 rounded-2xl bg-white p-6 shadow-sm md:grid-cols-2">
            <div>
              <img
                key={product.imageUrl}
                src={product.imageUrl}
                alt={product.name}
                className="aspect-square w-full rounded-xl bg-amber-100 object-cover"
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/favicon.svg";
                }}
              />
            </div>

            <div>
              <h1 className="text-3xl font-bold text-amber-900">
                {product.name}
              </h1>

              <p className="mt-3 text-gray-700">
                Giá gốc: {money(product.price)}
              </p>

              <p className="mt-2 text-sm text-gray-600">
                {product.stock > 0
                  ? `Còn ${product.stock} sản phẩm`
                  : "Sản phẩm hiện đã hết hàng"}
              </p>

              <fieldset className="mt-6">
                <legend className="font-bold text-gray-900">
                  Chọn size
                </legend>

                <div className="mt-3 flex flex-wrap gap-3">
                  {product.sizes.map((size) => (
                    <label
                      key={size.name}
                      className={`cursor-pointer rounded-lg border p-3 ${
                        selectedSize === size.name
                          ? "border-amber-800 bg-amber-100"
                          : "border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="size"
                        value={size.name}
                        checked={selectedSize === size.name}
                        onChange={() => setSelectedSize(size.name)}
                        className="mr-2 accent-amber-800"
                      />
                      {size.name} (+{money(size.price)})
                    </label>
                  ))}
                </div>

                {product.sizes.length === 0 && (
                  <p className="mt-2 text-red-700">
                    Sản phẩm chưa được cấu hình size.
                  </p>
                )}
              </fieldset>

              <fieldset className="mt-6">
                <legend className="font-bold text-gray-900">
                  Topping — có thể chọn nhiều loại
                </legend>

                <div className="mt-3 space-y-3">
                  {product.toppings.map((topping) => (
                    <label
                      key={topping.name}
                      className="flex cursor-pointer items-center gap-3"
                    >
                      <input
                        type="checkbox"
                        checked={selectedToppings.includes(topping.name)}
                        onChange={() => toggleTopping(topping.name)}
                        className="h-4 w-4 accent-amber-800"
                      />
                      <span>
                        {topping.name} (+{money(topping.price)})
                      </span>
                    </label>
                  ))}

                  {product.toppings.length === 0 && (
                    <p className="text-gray-600">
                      Sản phẩm không có topping.
                    </p>
                  )}
                </div>
              </fieldset>

              <div
                aria-live="polite"
                className="mt-8 rounded-xl bg-amber-50 p-4"
              >
                <p className="text-sm text-gray-700">
                  {money(product.price)} + {money(sizePrice)} size +{" "}
                  {money(toppingPrice)} topping
                </p>
                <p className="mt-2 text-2xl font-bold text-amber-900">
                  Giá một ly: {money(total)}
                </p>
              </div>

              <button
                type="button"
                onClick={addSelectedProduct}
                disabled={product.stock <= 0 || !selectedSize}
                className="mt-4 w-full rounded-xl bg-amber-800 px-5 py-3 font-bold text-white transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {product.stock <= 0 ? "Đã hết hàng" : "Thêm vào giỏ hàng"}
              </button>
              <Link href="/cart" className="mt-3 inline-block text-sm font-semibold text-amber-900 hover:underline">
                Giỏ hàng: {mounted ? cartQuantity : "…"} ly → Xem giỏ hàng
              </Link>
              {cartNotice && (
                <p role={cartNoticeAdded ? "status" : "alert"} aria-live="polite" className={`mt-2 text-sm font-semibold ${cartNoticeAdded ? "text-green-700" : "text-red-700"}`}>
                  {cartNotice}
                </p>
              )}
            </div>
          </article>
        )}
      </div>
    </main>
  );
}