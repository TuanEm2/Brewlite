import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import CartBadge from "./components/cart-badge";

export const metadata: Metadata = {
  title: "BrewLite | Đặt cà phê nhanh",
  description: "BrewLite - dự án đặt đồ uống, thanh toán không dùng tiền mặt.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <CartBadge />
        {children}
      </body>
    </html>
  );
}
