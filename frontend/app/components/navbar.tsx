"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/auth-store";

export default function Navbar() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isAuthenticated = mounted && Boolean(token && user);

  return (
    <header className="sticky top-0 z-40 border-b border-amber-200/70 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/menu"
            className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-amber-950 transition hover:text-amber-800"
          >
            <span className="text-2xl" aria-hidden="true">☕</span>
            <span>BrewLite</span>
          </Link>

          <nav className="hidden items-center gap-4 sm:flex">
            <Link
              href="/menu"
              className="text-sm font-semibold text-gray-700 transition hover:text-amber-900"
            >
              Menu
            </Link>
            <Link
              href="/cart"
              className="text-sm font-semibold text-gray-700 transition hover:text-amber-900"
            >
              Giỏ hàng
            </Link>
            {isAuthenticated && (
              <Link
                href="/orders"
                className="text-sm font-semibold text-gray-700 transition hover:text-amber-900"
              >
                Lịch sử đơn
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Link
                href="/orders"
                className="text-xs font-semibold text-amber-900 hover:underline sm:hidden"
              >
                Đơn hàng
              </Link>
              <span className="hidden text-xs font-medium text-gray-600 sm:inline">
                👤 {user?.email}
              </span>
              <button
                type="button"
                onClick={() => logout()}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                Đăng xuất
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-50"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-900"
              >
                Đăng ký
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
