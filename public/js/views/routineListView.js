// SCR-01: ルーティン一覧画面
import { calcRoutineTotalSeconds, escapeHtml, formatDateTime, formatDuration } from "../models.js";

/** 一覧画面の描画とイベント設定 */
export function renderRoutineListView(container, state, actions) {
  const { routines, pendingResults } = state.data;
  const sorted = [...routines].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const unsavedList = (pendingResults || []).filter((r) => r.calendarStatus !== "saved");
  const isExpanded = Boolean(state.pendingExpanded);
  const batchStatus = state.pendingBatchStatus || { isSaving: false, progressText: "", errorMessage: "" };
  const retryAllLabel = batchStatus.isSaving
    ? batchStatus.progressText || "保存中..."
    : unsavedList.length === 1
      ? "再試行"
      : "まとめて再試行";

  const pendingDetailsHtml = isExpanded
    ? `
      <ul class="pending-list">
        ${unsavedList
          .map(
            (item) => `
              <li class="pending-item" data-execution-id="${escapeHtml(item.executionId)}">
                <div class="pending-item-info">
                  <div class="pending-item-title">${escapeHtml(item.routineName)}</div>
                  <div class="muted-text pending-item-time">
                    ${escapeHtml(formatDateTime(item.startedAt))} 〜 ${escapeHtml(formatDateTime(item.completedAt))}
                  </div>
                </div>
                <div class="pending-item-actions">
                  <button type="button" class="btn btn-primary btn-sm" data-pending-action="retry" data-execution-id="${escapeHtml(item.executionId)}" ${batchStatus.isSaving ? "disabled" : ""}>再試行</button>
                  <button type="button" class="btn btn-danger btn-sm" data-pending-action="delete" data-execution-id="${escapeHtml(item.executionId)}" ${batchStatus.isSaving ? "disabled" : ""}>削除</button>
                </div>
              </li>
            `
          )
          .join("")}
      </ul>
    `
    : "";

  const pendingErrorHtml = batchStatus.errorMessage
    ? `<div class="pending-batch-error" role="alert">${escapeHtml(batchStatus.errorMessage)}</div>`
    : "";

  const pendingBannerHtml = unsavedList.length
    ? `
      <div class="alert-banner warn pending-banner" role="status">
        <div class="pending-banner-header">
          <div>
            <strong>未保存の完了履歴が ${unsavedList.length} 件あります</strong>
            ${!isExpanded ? `<div class="muted-text">${escapeHtml(unsavedList[0].routineName)}${unsavedList.length > 1 ? " ほか" : ""}</div>` : ""}
          </div>
          <div class="pending-banner-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-pending-details" aria-expanded="${isExpanded ? "true" : "false"}">${isExpanded ? "閉じる" : "詳細"}</button>
            <button type="button" class="btn btn-warn btn-sm" id="btn-retry-all-pending" ${batchStatus.isSaving ? "disabled" : ""}>${escapeHtml(retryAllLabel)}</button>
          </div>
        </div>
        ${pendingErrorHtml}
        ${pendingDetailsHtml}
      </div>
    `
    : "";

  const listHtml = sorted.length
    ? `<div class="routine-list" id="routine-list">
        ${sorted
          .map((rt, idx) => {
            const totalSec = calcRoutineTotalSeconds(rt);
            const medCount = (rt.medications || []).length;
            return `
              <article class="card routine-card" draggable="true" data-id="${escapeHtml(rt.id)}" data-index="${idx}">
                <div class="routine-card-head">
                  <div class="routine-title-wrap">
                    <span class="drag-handle" title="ドラッグして並び替え" aria-label="並び替えハンドル">☰</span>
                    <h2 class="routine-title">${escapeHtml(rt.name)}</h2>
                  </div>
                  <span class="meta-pill">薬${medCount}種 / 計 ${escapeHtml(formatDuration(totalSec))}</span>
                </div>
                <div class="routine-card-actions">
                  <button type="button" class="btn btn-primary" data-action="start" data-id="${escapeHtml(rt.id)}">確認して開始</button>
                  <button type="button" class="btn btn-secondary" data-action="edit" data-id="${escapeHtml(rt.id)}">編集</button>
                  <button type="button" class="btn btn-danger" data-action="delete" data-id="${escapeHtml(rt.id)}">削除</button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>`
    : `<div class="card empty-state">
        <p>登録されているルーティンがありません。</p>
        <p class="muted-text">「＋ 新規作成」から点眼薬と各工程を登録してください。</p>
      </div>`;

  container.innerHTML = `
    <div class="view-header">
      <h1>ルーティン一覧</h1>
      <button type="button" class="btn btn-primary" id="btn-new-routine">＋ 新規作成</button>
    </div>
    ${pendingBannerHtml}
    ${listHtml}
  `;

  // 新規作成
  container.querySelector("#btn-new-routine")?.addEventListener("click", () => {
    actions.onCreate();
  });

  // 未保存履歴バナー操作（詳細トグル・まとめて再試行）
  container.querySelector("#btn-toggle-pending-details")?.addEventListener("click", () => {
    actions.onTogglePendingDetails();
  });
  container.querySelector("#btn-retry-all-pending")?.addEventListener("click", () => {
    actions.onRetryAllPending();
  });

  // 未保存履歴の個別操作（再試行・削除）
  container.querySelectorAll("[data-pending-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const executionId = btn.dataset.executionId;
      const action = btn.dataset.pendingAction;
      const target = unsavedList.find((item) => item.executionId === executionId);
      if (!target) return;

      if (action === "retry") actions.onRetryPending(target);
      if (action === "delete") actions.onDeletePending(target);
    });
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
  setupDragAndDrop(container.querySelector("#routine-list"), sorted, actions.onReorder);
}

/** リスト要素のドラッグ＆ドロップ並び替えを設定 */
function setupDragAndDrop(listEl, items, onReorder) {
  if (!listEl || items.length < 2) return;
  let draggingId = null;

  listEl.querySelectorAll(".routine-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      draggingId = card.dataset.id;
      card.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      draggingId = null;
      card.classList.remove("is-dragging");
      listEl.querySelectorAll(".routine-card").forEach((el) => el.classList.remove("drag-over"));
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
