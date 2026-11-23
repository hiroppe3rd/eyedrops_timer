// SCR-05: 完了・Googleカレンダー登録画面
import { buildGoogleCalendarTemplateUrl } from "../calendar.js";
import { escapeHtml, formatDateTime } from "../models.js";

/** 完了画面の描画とカレンダー遷移制御 */
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
  const calendarUrl = result.htmlLink || buildGoogleCalendarTemplateUrl(result);

  const renderContent = () => {
    const isSaved = currentStatus === "saved";

    const badgeHtml = isSaved
      ? `<span class="status-badge success">✓ Googleカレンダー作成画面を開きました</span>`
      : `<span class="status-badge warn">未登録（ブラウザーに一時保存中）</span>`;

    const actionHtml = isSaved
      ? `<div style="margin-top: 16px; display:flex; flex-direction:column; gap:10px;">
           <a href="${escapeHtml(calendarUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="width:100%;">もう一度Googleカレンダーを開く</a>
         </div>`
      : `<div style="margin-top: 16px;">
           <a href="${escapeHtml(calendarUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" id="btn-save-calendar" style="width:100%; padding:12px;">
             Googleカレンダーに予定を作成
           </a>
           <p class="muted-text" style="margin-top:8px; font-size:0.85rem;">
             別タブでGoogleカレンダーの予定作成画面が開きます。内容を確認して「保存」を押してください。
           </p>
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

          <div class="field-label">カレンダー登録状態</div>
          <div>${badgeHtml}</div>
        </div>
        ${actionHtml}
      </section>
    `;

    container.querySelector("#btn-done-home")?.addEventListener("click", () => {
      actions.onBackHome();
    });

    container.querySelector("#btn-save-calendar")?.addEventListener("click", () => {
      if (currentStatus === "saved") return;
      currentStatus = "saved";
      actions.onSaved(result.executionId, calendarUrl);
      renderContent();
    });
  };

  renderContent();
}
