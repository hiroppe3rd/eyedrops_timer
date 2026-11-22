// SCR-01: ワークアウト一覧画面
import { calcWorkoutTotalSeconds, escapeHtml, formatDuration } from "../models.js";

/** 一覧画面の描画とイベント設定 */
export function renderWorkoutListView(container, state, actions) {
  const { workouts, pendingResults } = state.data;
  const sorted = [...workouts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const unsavedList = (pendingResults || []).filter((r) => r.calendarStatus !== "saved");

  const pendingBannerHtml = unsavedList.length
    ? `
      <div class="alert-banner warn" role="status">
        <div>
          <strong>未保存の完了履歴が ${unsavedList.length} 件あります</strong>
          <div class="muted-text">${escapeHtml(unsavedList[0].workoutName)}</div>
        </div>
        <button type="button" class="btn btn-warn" id="btn-retry-pending">保存を再試行</button>
      </div>
    `
    : "";

  const listHtml = sorted.length
    ? `<div class="workout-list" id="workout-list">
        ${sorted
          .map((wo, idx) => {
            const totalSec = calcWorkoutTotalSeconds(wo);
            const medCount = (wo.medications || []).length;
            return `
              <article class="card workout-card" draggable="true" data-id="${escapeHtml(wo.id)}" data-index="${idx}">
                <div class="workout-card-head">
                  <div class="workout-title-wrap">
                    <span class="drag-handle" title="ドラッグして並び替え" aria-label="並び替えハンドル">☰</span>
                    <h2 class="workout-title">${escapeHtml(wo.name)}</h2>
                  </div>
                  <span class="meta-pill">薬${medCount}種 / 計 ${escapeHtml(formatDuration(totalSec))}</span>
                </div>
                <div class="workout-card-actions">
                  <button type="button" class="btn btn-primary" data-action="start" data-id="${escapeHtml(wo.id)}">確認して開始</button>
                  <button type="button" class="btn btn-secondary" data-action="edit" data-id="${escapeHtml(wo.id)}">編集</button>
                  <button type="button" class="btn btn-danger" data-action="delete" data-id="${escapeHtml(wo.id)}">削除</button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>`
    : `<div class="card empty-state">
        <p>登録されているワークアウトがありません。</p>
        <p class="muted-text">「＋ 新規作成」から点眼薬と各工程を登録してください。</p>
      </div>`;

  container.innerHTML = `
    <div class="view-header">
      <h1>ワークアウト一覧</h1>
      <button type="button" class="btn btn-primary" id="btn-new-workout">＋ 新規作成</button>
    </div>
    ${pendingBannerHtml}
    ${listHtml}
  `;

  // 新規作成
  container.querySelector("#btn-new-workout")?.addEventListener("click", () => {
    actions.onCreate();
  });

  // 未保存履歴の再試行（フェーズ5でSCR-05へ接続）
  container.querySelector("#btn-retry-pending")?.addEventListener("click", () => {
    actions.onRetryPending(unsavedList[0]);
  });

  // カードボタン操作
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "start") actions.onStart(id);
      if (action === "edit") actions.onEdit(id);
      if (action === "delete") actions.onDelete(id);
    });
  });

  // ドラッグ＆ドロップ並び替え
  setupDragAndDrop(container.querySelector("#workout-list"), sorted, actions.onReorder);
}

/** リスト要素のドラッグ＆ドロップ並び替えを設定 */
function setupDragAndDrop(listEl, items, onReorder) {
  if (!listEl || items.length < 2) return;
  let draggingId = null;

  listEl.querySelectorAll(".workout-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      draggingId = card.dataset.id;
      card.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      draggingId = null;
      card.classList.remove("is-dragging");
      listEl.querySelectorAll(".workout-card").forEach((el) => el.classList.remove("drag-over"));
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!draggingId || draggingId === card.dataset.id) return;
      card.classList.add("drag-over");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      const targetId = card.dataset.id;
      if (!draggingId || draggingId === targetId) return;

      const fromIdx = items.findIndex((item) => item.id === draggingId);
      const toIdx = items.findIndex((item) => item.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return;

      const reordered = [...items];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      onReorder(reordered.map((w) => w.id));
    });
  });
}
