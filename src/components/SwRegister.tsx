"use client";

// オフライン対応：公開版でだけ Service Worker を登録し、新しい版があれば［更新］の帯を出す

import { useEffect, useState } from "react";

export function SwRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH;
    if (process.env.NODE_ENV !== "production" || !base || !("serviceWorker" in navigator)) return;
    let reloaded = false;
    // はじめて Service Worker が動き出したとき（古い版がない）は読み直さない
    const hadController = !!navigator.serviceWorker.controller;
    const onChange = () => {
      // 新しい版に切り替わったら一度だけ読み直す（セーブは毎回自動保存済み）
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    let onVisible: (() => void) | null = null;
    navigator.serviceWorker
      .register(`${base}/sw.js`, { scope: `${base}/` })
      .then((reg) => {
        const check = (w: ServiceWorker | null | undefined) => {
          if (w && navigator.serviceWorker.controller) setWaiting(w);
        };
        check(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed") check(reg.waiting ?? w);
          });
        });
        // ホーム画面のアプリは読み直しが少ないので、画面に戻ったときに新しい版を確かめる
        onVisible = () => {
          if (document.visibilityState === "visible") void reg.update().catch(() => undefined);
        };
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch(() => undefined);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!waiting) return null;
  return (
    <div className="fixed inset-x-2 top-2 z-[70] mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-slate-900/95 px-3 py-2 text-white shadow-2xl" style={{ top: "calc(env(safe-area-inset-top) + 8px)" }} role="status">
      <span className="min-w-0 flex-1 text-xs font-bold">✨ 新しいバージョンがあります</span>
      <button type="button" onClick={() => setWaiting(null)} className="min-h-9 rounded-full px-2 text-[11px] font-bold text-slate-300">
        あとで
      </button>
      <button type="button" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })} className="min-h-9 rounded-full bg-orange-500 px-3 text-xs font-black">
        更新する
      </button>
    </div>
  );
}
