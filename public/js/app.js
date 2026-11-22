// 点眼タイマー SPA エントリーポイント
import {
  calcWorkoutTotalSeconds,
  createDefaultWorkout,
  escapeHtml,
  formatDuration,
} from "./models.js";
import { loadAppData, saveAppData } from "./storage.js";
import { renderWorkoutListView } from "./views/workoutListView.js";
import { renderWorkoutEditView } from "./views/workoutEditView.js";

const appContainer = document.getElementById("app");
const appState = {
  data: loadAppData(),
  currentScreen: "SCR-01",
  editingWorkout: null,
  editingIsNew: false,
  selectedWorkoutId: null,
};

/** 画面描画 */
function render() {
  if (!appContainer) return;

  if (appState.currentScreen === "SCR-01") {
    renderWorkoutListView(appContainer, appState, {
      onCreate: () => {
        appState.editingWorkout = createDefaultWorkout();
        appState.editingIsNew = true;
        appState.currentScreen = "SCR-02";
        render();
      },
      onEdit: (id) => {
        const target = appState.data.workouts.find((w) => w.id === id);
        if (!target) return;
        appState.editingWorkout = structuredClone(target);
        appState.editingIsNew = false;
        appState.currentScreen = "SCR-02";
        render();
      },
      onDelete: (id) => {
        const target = appState.data.workouts.find((w) => w.id === id);
        if (!target) return;
        if (!window.confirm(`「${target.name}」を削除しますか？`)) return;
        appState.data.workouts = appState.data.workouts
          .filter((w) => w.id !== id)
          .map((w, idx) => ({ ...w, order: idx }));
        saveAppData(appState.data);
        render();
      },
      onReorder: (orderedIds) => {
        const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
        appState.data.workouts = appState.data.workouts
          .map((w) => ({ ...w, order: orderMap.get(w.id) ?? w.order }))
          .sort((a, b) => a.order - b.order);
        saveAppData(appState.data);
        render();
      },
      onStart: (id) => {
        appState.selectedWorkoutId = id;
        appState.currentScreen = "SCR-03";
        render();
      },
      onRetryPending: () => {
        // フェーズ5でSCR-05を実装予定
        window.alert("カレンダー保存画面（SCR-05）はフェーズ5で実装予定です。");
      },
    });
    return;
  }

  if (appState.currentScreen === "SCR-02") {
    renderWorkoutEditView(appContainer, appState.editingWorkout, appState.editingIsNew, {
      onCancel: () => {
        appState.editingWorkout = null;
        appState.currentScreen = "SCR-01";
        render();
      },
      onSave: (savedWorkout) => {
        const now = new Date().toISOString();
        if (appState.editingIsNew) {
          const nextOrder = appState.data.workouts.length;
          appState.data.workouts.push({
            ...savedWorkout,
            order: nextOrder,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          appState.data.workouts = appState.data.workouts.map((w) =>
            w.id === savedWorkout.id ? { ...savedWorkout, updatedAt: now } : w
          );
        }
        saveAppData(appState.data);
        appState.editingWorkout = null;
        appState.currentScreen = "SCR-01";
        render();
      },
    });
    return;
  }

  if (appState.currentScreen === "SCR-03") {
    const workout = appState.data.workouts.find((w) => w.id === appState.selectedWorkoutId);
    if (!workout) {
      appState.currentScreen = "SCR-01";
      render();
      return;
    }
    const totalSec = calcWorkoutTotalSeconds(workout);
    appContainer.innerHTML = `
      <div class="view-header">
        <button type="button" class="btn btn-secondary" id="btn-back-list">← 一覧へ</button>
        <h1>開始前確認</h1>
        <span></span>
      </div>
      <section class="card">
        <h2 style="margin-top:0;">${escapeHtml(workout.name)}</h2>
        <p>合計予定時間: <strong>${escapeHtml(formatDuration(totalSec))}</strong></p>
        <ul>
          ${workout.medications
            .map(
              (m) => `
              <li>
                <strong>${escapeHtml(m.name)}</strong>:
                ${m.steps.map((s) => `${escapeHtml(s.label)}（${escapeHtml(formatDuration(s.durationSec))}）`).join(" → ")}
              </li>`
            )
            .join("")}
        </ul>
        <p class="muted-text">※ タイマー実行（SCR-04）と音声設定はフェーズ3〜4で実装予定です。</p>
      </section>
    `;
    appContainer.querySelector("#btn-back-list")?.addEventListener("click", () => {
      appState.currentScreen = "SCR-01";
      render();
    });
  }
}

// 初期描画
document.addEventListener("DOMContentLoaded", () => {
  render();
});
