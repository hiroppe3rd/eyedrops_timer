// SCR-05: 完了・Googleカレンダー保存画面
import { saveRoutineToGoogleCalendar } from "../calendar.js";
import { escapeHtml, formatDateTime } from "../models.js";

/** 完了画面の描画と保存制御 */
export function renderCompleteView(container, result, actions) {
  if (!result) {
    container.innerHTML = `
      <div class="view-header">
        <span></span>
        <h1>ルーティン完了</h1>
        <button type="button" class="btn btn-secondary" id="btn-done-home">一覧へ</button>
      </div>
      <section class="card">
        <p>表示できる完了履歴がありません。</p>
      </section>
    `;
    container.querySelector("#btn-done-home")?.addEventListener("click", () => actions.onBackHome());
    return;
  }

  let currentStatus = result.calendarStatus || "unsaved";
  let errorMessage = "";
  let createdEventUrl = result.htmlLink || "";

  const renderContent = () => {
    const isSaved = currentStatus === "saved";
    const isSaving = currentStatus === "saving";

    let badgeHtml = `<span class="status-badge warn">未保存（ブラウザーに一時保存中）</span>`;
    if (isSaving) {
      badgeHtml = `<span class="status-badge info">Googleカレンダーへ保存中...</span>`;
    } else if (isSaved) {
      badgeHtml = `<span class="status-badge success">✓ Googleカレンダーに保存済み</span>`;
    }

    const errorHtml = errorMessage
      ? `<div class="alert-banner error" role="alert" style="margin-top:12px;">${escapeHtml(errorMessage)}</div>`
      : "";

    const actionHtml = isSaved
      ? `<div style="margin-top: 16px; display:flex; flex-direction:column; gap:10px;">
           <button type="button" class="btn btn-secondary" disabled style="width:100%; padding:12px;">保存済み（二重登録防止）</button>
           ${
             createdEventUrl
               ? `<a href="${escapeHtml(createdEventUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="width:100%;">Googleカレンダーで予定を開く</a>`
               : ""
           }
         </div>`
      : `<div style="margin-top: 16px;">
           <button type="button" class="btn btn-primary" id="btn-save-calendar" ${
             isSaving ? "disabled" : ""
           } style="width:100%; padding:12px;">
             ${isSaving ? "保存中..." : errorMessage ? "保存を再試行する" : "Googleカレンダーに保存"}
           </button>
         </div>`;

    container.innerHTML = `
      <div class="view-header">
        <span></span>
        <h1>ルーティン完了</h1>
        <button type="button" class="btn btn-secondary" id="btn-done-home">一覧へ</button>
      </div>

      <section class="card">
        <div style="color:var(--accent); font-weight:700; font-size:1.08rem; margin-bottom:12px;">
          ✓ すべての工程が完了しました
        </div>
        <div class="result-detail">
          <div class="field-label">ルーティン名</div>
          <div style="font-weight:700; margin-bottom:10px;">${escapeHtml(result.routineName)}</div>

          <div class="field-label">開始日時 〜 完了日時</div>
          <div style="margin-bottom:10px;">
            ${escapeHtml(formatDateTime(result.startedAt))} 〜 ${escapeHtml(formatDateTime(result.completedAt))}
          </div>

          <div class="field-label">カレンダー保存状態</div>
          <div>${badgeHtml}</div>
        </div>
        ${errorHtml}
        ${actionHtml}
      </section>
    `;

    container.querySelector("#btn-done-home")?.addEventListener("click", () => {
      actions.onBackHome();
    });

    container.querySelector("#btn-save-calendar")?.addEventListener("click", async () => {
      // 二重登録防止ガード
      if (currentStatus === "saved" || currentStatus === "saving") return;
      currentStatus = "saving";
      errorMessage = "";
      renderContent();

      try {
        const created = await saveRoutineToGoogleCalendar(result);
        currentStatus = "saved";
        createdEventUrl = created?.htmlLink || "";
        actions.onSaved(result.executionId, createdEventUrl);
        renderContent();
      } catch (err) {
        currentStatus = "unsaved";
        errorMessage = err?.message || "Googleカレンダーへの保存に失敗しました。";
        renderContent();
      }
    });
  };

  renderContent();
}
