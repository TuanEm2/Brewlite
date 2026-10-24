"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuthStore } from "../../store/auth-store";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/menu";

  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
  ).replace(/\/+$/, "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Mật khẩu phải có ít nhất 8 ký tự.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setLoading(true);

    try {
      // 1. Đăng ký tài khoản
      const res = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          throw new Error("Email này đã được đăng ký. Vui lòng sử dụng email khác.");
        }
        if (res.status === 400) {
          const msg = Array.isArray(data.message)
            ? data.message.join(", ")
            : data.message;
          throw new Error(msg || "Dữ liệu không hợp lệ.");
        }
        throw new Error(data.message || "Đăng ký thất bại.");
      }

      // 2. Tự động đăng nhập để lấy JWT token ngay
      const loginRes = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      if (loginRes.ok) {
        const loginData = await loginRes.json();
        setAuth(loginData.access_token, loginData.user);
        router.push(redirectPath);
      } else {
        router.push(`/login?registered=true&redirect=${encodeURIComponent(redirectPath)}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi kết nối.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-amber-200/80 bg-white p-8 shadow-sm">
      <div className="text-center">
        <span className="text-4xl" aria-hidden="true">☕</span>
        <h1 className="mt-3 text-2xl font-extrabold text-amber-950">
          Tạo tài khoản mới
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Tham gia BrewLite để trải nghiệm đặt đồ uống nhanh
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-semibold text-gray-800"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@example.com"
            className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 transition focus:border-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-semibold text-gray-800"
          >
            Mật khẩu (ít nhất 8 ký tự)
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 transition focus:border-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-semibold text-gray-800"
          >
            Xác nhận mật khẩu
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 transition focus:border-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-amber-800 py-3 font-bold text-white shadow-sm transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {loading ? "Đang tạo tài khoản..." : "Đăng ký"}
        </button>
      </form>

      <div className="mt-6 border-t border-amber-100 pt-4 text-center text-sm text-gray-600">
        Đã có tài khoản?{" "}
        <Link
          href={`/login${redirectPath ? `?redirect=${encodeURIComponent(redirectPath)}` : ""}`}
          className="font-bold text-amber-800 hover:underline"
        >
          Đăng nhập
        </Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <Suspense fallback={<p className="text-amber-900">Đang tải...</p>}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
