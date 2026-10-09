import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "ポケットタウン — 小さな町づくりシミュレーション",
  description: "小さな町を自分の判断で育てる、ブラウザで遊べるコンパクトな街づくりゲーム。",
  // iPhone でホーム画面に追加したとき、アプリのように全画面で開く
  appleWebApp: { capable: true, title: "ポケットタウン", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // iPhone のノッチ・ホームバーの下まで背景を広げ、中身は safe-area で避ける
  viewportFit: "cover",
  themeColor: "#d8efff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
