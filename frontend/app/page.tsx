"use client";

import { useEffect, useState } from "react";

type Health = { status: string; service: string; timestamp: string };
type ApiState = { kind: "loading" | "ok" | "error"; health?: Health };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function CoffeeIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M5 10h16v8a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7v-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M21 12h1.5a3.5 3.5 0 0 1 0 7H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  const [api, setApi] = useState<ApiState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBaseUrl}/api/health`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as Health;
      })
      .then((body) => {
        if (body.status !== "ok") throw new Error("API trả về trạng thái không hợp lệ");
        setApi({ kind: "ok", health: body });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setApi({ kind: "error" });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f5ef] text-[#2f2a23]">
      <div className="pointer-events-none absolute -right-44 top-24 h-[28rem] w-[28rem] rounded-full bg-[#d7c3a0]/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-48 top-[29rem] h-[24rem] w-[24rem] rounded-full bg-[#e7d7b9]/40 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-9">
        <header className="flex items-center justify-between border-b border-[#dfd8ca] py-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#594535] text-[#fbf1df] shadow-sm">
              <CoffeeIcon />
            </div>
            <div>
              <p className="text-xl font-black tracking-tight">Brew<span className="text-[#a27040]">Lite</span></p>
              <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[#847461]">Coffee ordering</p>
            </div>
          </div>
          <span className="rounded-full border border-[#d8c9b5] bg-[#fffaf2] px-3 py-1.5 text-xs font-semibold text-[#866343]">
            Sprint 1 · Task 1
          </span>
        </header>

        <section className="grid flex-1 items-center gap-14 py-14 lg:grid-cols-[1.15fr_.85fr] lg:py-20">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dfcfb8] bg-[#fff7e9] px-3 py-2 text-xs font-semibold text-[#816042]">
              <span className="h-2 w-2 rounded-full bg-[#b98e4f]" />
              Nền tảng cho đồ án Công nghệ Phần mềm
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-[1.1] tracking-[-.05em] sm:text-6xl lg:text-7xl">
              Cà phê ngon.<br />
              <span className="text-[#997044]">Đặt thật nhanh.</span>
            </h1>
            <p className="mt-7 max-w-lg text-base leading-8 text-[#756b5e] sm:text-lg">
              BrewLite hướng tới trải nghiệm chọn đồ uống và thanh toán không tiền mặt trong vài chạm.
              Đây là màn hình khởi tạo dự án; menu và đặt hàng sẽ được nhóm phát triển ở các task tiếp theo.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="/menu" className="rounded-xl bg-[#654a35] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#654a35]/15 transition hover:-translate-y-0.5 hover:bg-[#4b3728]">
                Xem Menu →
              </a>
              <a href="https://github.com/TuanEm2/Brewlite" target="_blank" rel="noreferrer" className="rounded-xl border border-[#d6c8b5] bg-white/75 px-6 py-3.5 text-sm font-semibold text-[#684d3a] transition hover:bg-white">
                GitHub của nhóm ↗
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-3 rotate-3 rounded-[2.4rem] border border-[#d7bd94] bg-[#eee0c7]/65" />
            <div className="relative overflow-hidden rounded-[2rem] bg-[#574131] p-7 text-[#f7ead8] shadow-2xl shadow-[#4f3922]/20 sm:p-9">
              <div className="flex justify-between text-xs font-semibold uppercase tracking-[.25em] text-[#e4ccb0]">
                <span>BrewLite</span><span>Ver 1.0</span>
              </div>
              <div className="my-8 flex justify-center">
                <div className="relative grid h-56 w-56 place-items-center rounded-full border border-[#c29f74]/35 bg-[#6b503a] shadow-[inset_0_0_0_16px_#634832,0_24px_40px_#35251b60]">
                  <div className="absolute inset-7 rounded-full border border-[#e0b98c]/30" />
                  <div className="scale-[3] text-[#f6e3c4]"><CoffeeIcon /></div>
                </div>
              </div>
              <div className="border-t border-[#8a7057] pt-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-bold">Sẵn sàng khởi động</h2>
                  <span className="rounded-full bg-[#8e7557] px-2.5 py-1 text-[11px]">MVP</span>
                </div>
                <p className="text-sm leading-6 text-[#e4ceb4]">Giao diện Next.js kết nối với API NestJS. Database và danh sách đồ uống sẽ được thêm vào trong Sprint 1.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="status" className="mb-12 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#dfd4c3] bg-white/80 p-6 shadow-sm">
            <div className="mb-4 text-xs font-bold uppercase tracking-widest text-[#93826d]">01 · Frontend</div>
            <div className="mb-2 text-lg font-bold">Next.js + TypeScript</div>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#377956]"><span className="h-2 w-2 rounded-full bg-[#4ea771]" /> Đang chạy trang web</span>
            <p className="mt-3 text-xs text-[#8a8074]">http://localhost:3000</p>
          </div>
          <div className="rounded-2xl border border-[#dfd4c3] bg-white/80 p-6 shadow-sm">
            <div className="mb-4 text-xs font-bold uppercase tracking-widest text-[#93826d]">02 · Backend</div>
            <div className="mb-2 text-lg font-bold">NestJS REST API</div>
            <span className={`inline-flex items-center gap-2 text-sm font-semibold ${api.kind === "ok" ? "text-[#377956]" : api.kind === "error" ? "text-[#a4503c]" : "text-[#94724c]"}`}>
              <span className={`h-2 w-2 rounded-full ${api.kind === "ok" ? "bg-[#4ea771]" : api.kind === "error" ? "bg-[#c87359]" : "animate-pulse bg-[#d0a560]"}`} />
              {api.kind === "ok" ? "Đã kết nối API" : api.kind === "error" ? "Chưa kết nối API" : "Đang kiểm tra API..."}
            </span>
            <p className="mt-3 text-xs text-[#8a8074]">{apiBaseUrl}/api/health</p>
          </div>
          <div className="rounded-2xl border border-[#dfd4c3] bg-white/80 p-6 shadow-sm">
            <div className="mb-4 text-xs font-bold uppercase tracking-widest text-[#93826d]">03 · Database</div>
            <div className="mb-2 text-lg font-bold">PostgreSQL + Prisma</div>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#927049]"><span className="h-2 w-2 rounded-full bg-[#c9a76b]" /> Chờ TV2 thực hiện</span>
            <p className="mt-3 text-xs text-[#8a8074]">Được tích hợp trong Task 2</p>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfd8ca] py-6 text-xs text-[#938470]">
          <span>© 2026 BrewLite · Software Engineering Group Project</span>
          <span>Next.js · NestJS · Agile Scrum</span>
        </footer>
      </div>
    </main>
  );
}
