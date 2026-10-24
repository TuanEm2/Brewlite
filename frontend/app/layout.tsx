import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import CartBadge from "./components/cart-badge";
import Navbar from "./components/navbar";

export const metadata: Metadata = {
  title: "BrewLite | Đặt cà phê nhanh",
  description: "BrewLite - dự án đặt đồ uống, thanh toán không dùng tiền mặt.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-amber-50/40 text-gray-900 antialiased">
        <Navbar />
        <CartBadge />
        {children}
      </body>
    </html>
  );
}
