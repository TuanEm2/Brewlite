"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCartStore } from "../../store/cart-store";
import { cartCount } from "../../store/cart-utils";
import { badgeLabel } from "../../store/cart-view";

/** Floating cart button shown on every page except the cart itself. */
export default function CartBadge() {
  const pathname = usePathname();
  const count = useCartStore((state) => cartCount(state.items));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (pathname === "/cart") return null;
  const label = mounted ? badgeLabel(count) : "";

  return (
    <Link
      href="/cart"
      aria-label={`Xem giỏ hàng${mounted ? `, ${count} ly` : ""}`}
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/95 px-4 py-2 text-sm font-semibold text-amber-900 shadow-lg backdrop-blur transition hover:bg-amber-50"
    >
      <span aria-hidden="true">🛒</span>
      Giỏ hàng
      {label && (
        <span
          data-testid="cart-badge-count"
          className="inline-flex min-w-6 items-center justify-center rounded-full bg-amber-800 px-1.5 py-0.5 text-xs font-bold text-white"
        >
          {label}
        </span>
      )}
    </Link>
  );
}
