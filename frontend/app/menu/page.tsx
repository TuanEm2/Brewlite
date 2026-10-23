'use client';

import { useEffect, useState } from 'react';
import Link from "next/link";
import { useCartStore } from "../../store/cart-store";
import { cartCount } from "../../store/cart-utils";

interface Product {
  id: number;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  category?: string;
}

export default function MenuPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const cartQuantity = useCartStore((state) => cartCount(state.items));
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
        const res = await fetch(`${apiUrl}/products`);
        if (!res.ok) {
          throw new Error('Không thể tải danh sách sản phẩm');
        }
        const data = await res.json();
        setProducts(data);
      } catch (err: any) {
        setError(err.message || 'Đã có lỗi xảy ra');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  return (
    <div className="min-h-screen bg-amber-50/50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-amber-900 tracking-tight sm:text-5xl">
            ☕ Menu Đồ Uống BrewLite
          </h1>
          <p className="mt-3 text-lg text-amber-700 max-w-2xl mx-auto">
            Thưởng thức hương vị đậm đà với đặt hàng & thanh toán không tiền mặt tiện lợi.
          </p>
          <p className="mt-4 inline-flex rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900" aria-live="polite">
            🛒 Giỏ hàng: {mounted ? cartQuantity : "…"} ly
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-800"></div>
            <p className="mt-4 text-amber-800 font-medium">Đang tải menu thơm ngon...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl text-center max-w-md mx-auto shadow-sm">
            <p className="font-semibold">⚠️ Lỗi kết nối</p>
            <p className="text-sm mt-1">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-3 text-xs bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1.5 rounded-md font-medium transition"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && products.length === 0 && (
          <div className="bg-white p-10 rounded-2xl shadow-sm text-center border border-amber-100 max-w-md mx-auto">
            <span className="text-5xl">☕</span>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Chưa có sản phẩm</h3>
            <p className="mt-1 text-sm text-gray-500">Menu hiện tại chưa có đồ uống nào được đăng.</p>
          </div>
        )}

        {/* Product Grid */}
        {!loading && !error && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <div 
                key={product.id} 
                className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden border border-amber-100/80 flex flex-col justify-between"
              >
                <div className="p-6">
                  <div className="w-full h-40 bg-amber-100 rounded-xl mb-4 overflow-hidden flex items-center justify-center text-4xl">
                    🍹
                  </div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{product.name}</h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                      #{product.id}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm line-clamp-2">
                    {product.description || 'Đồ uống thơm ngon chuẩn vị BrewLite.'}
                  </p>
                </div>

                <div className="px-6 pb-6 pt-2 border-t border-gray-50 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-400 block">Đơn giá</span>
                    <span className="text-xl font-extrabold text-amber-600">
                      {product.price.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                  <Link href={`/products/${product.id}`} className="bg-amber-800 hover:bg-amber-900 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm hover:shadow transition transform active:scale-95">
                    Chọn món
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}