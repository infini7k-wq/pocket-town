import type { MetadataRoute } from "next";

// iPhone / Android の「ホーム画面に追加」で、アプリのように全画面で開けるようにする
export const dynamic = "force-static";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ポケットタウン — 小さな町づくりシミュレーション",
    short_name: "ポケットタウン",
    description: "小さな町を自分の判断で育てる、ブラウザで遊べるコンパクトな街づくりゲーム。",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#eef8ff",
    theme_color: "#d8efff",
    lang: "ja",
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
  };
}
