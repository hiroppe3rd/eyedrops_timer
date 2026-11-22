// 点眼タイマー SPA エントリーポイント
import { loadAppData } from "./storage.js";

const appContainer = document.getElementById("app");
let appState = {
  data: loadAppData(),
  currentScreen: "SCR-01",
};

/** 画面切り替え */
export function navigate(screenId) {
  appState.currentScreen = screenId;
  render();
}

/** 画面描画 */
function render() {
  if (!appContainer) return;

  // 初期土台確認用のプレースホルダ表示（フェーズ2以降で各画面を実装）
  appContainer.innerHTML = `
    <section class="card">
      <h1 style="margin-top:0;">ワークアウト一覧（準備中）</h1>
      <p>登録済みワークアウト: ${appState.data.workouts.length} 件</p>
      <p style="color: var(--text-muted); font-size: 0.9rem;">
        土台（SPAシェル・PWAマニフェスト・ストレージ基盤・OAuth公開ページ）の構築が完了しました。
      </p>
    </section>
  `;
}

// 初期描画
document.addEventListener("DOMContentLoaded", () => {
  render();
});
