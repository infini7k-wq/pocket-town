import type { NextConfig } from "next";

// GitHub Pages 用のビルド（npm run build:pages）では、静的なファイルとして書き出し、
// https://<ユーザー>.github.io/pocket-town/ のようなサブパスで動くようにする
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // 親ディレクトリにも package-lock.json があるため、ルートを明示する
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // 同じ Wi-Fi の iPhone などから開発サーバーにアクセスできるようにする
  // （.env.local に DEV_ORIGINS=192.168.x.x,マシン名.local のように書く）
  allowedDevOrigins: (process.env.DEV_ORIGINS ?? "").split(",").filter(Boolean),
  // 開発中に左下に出る「N」アイコン（開発用インジケーター）を表示しない
  devIndicators: false,
  ...(basePath ? { output: "export" as const, basePath, trailingSlash: true } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
