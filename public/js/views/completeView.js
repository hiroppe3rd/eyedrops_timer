// SCR-05: 完了・Googleカレンダー登録画面
import {
  buildGoogleCalendarTemplateUrl,
  saveResultToGoogleCalendar,
} from "../calendar.js";
import { getRuntimeConfig } from "../config.js";
import { escapeHtml, formatDateTime } from "../models.js";

/** 完了画面の描画とカレンダー遷移制御 */
export function renderCompleteView(container, result, actions) {
  if (!result) {
    container.innerHTML = `
      <div class="view-header">
        <div class="view-header-top">
          <button type="button" class="btn btn-secondary" id="btn-done-home">← 一覧へ</button>
        </div>
        <h1>ルーティン完了</h1>
      </div>
      <section class="card">
        <p>表示できる完了履歴がありません。</p>
      </section>
    `;
    container.querySelector("#btn-done-home")?.addEventListener("click", () => actions.onBackHome());
    return;
  }

  const hasClientId = Boolean(getRuntimeConfig().googleClientId);
  let currentStatus = result.calendarStatus || "unsaved";
  let savedLink = result.htmlLink || "";
  let errorMessage = "";
  const templateUrl = buildGoogleCalendarTemplateUrl(result);

  actions.bindSavingChecker?.(() => currentStatus === "saving");

  const renderContent = () => {
    const isSaved = currentStatus === "saved";
    const isSaving = currentStatus === "saving";

    let badgeHtml = `<span class="status-badge warn">未登録（ブラウザーに一時保存中）</span>`;
    if (isSaving) {
      badgeHtml = `<span class="status-badge warn">Googleカレンダーへ記録中...</span>`;
    } else if (isSaved) {
      badgeHtml = hasClientId
        ? `<span class="status-badge success">✓ Googleカレンダーに記録しました</span>`
        : `<span class="status-badge success">✓ Googleカレンダー作成画面を開きました</span>`;
    } else if (currentStatus === "error") {
      badgeHtml = `<span class="status-badge warn">記録失敗（ブラウザーに一時保存中）</span>`;
    }

    const errorHtml = errorMessage
      ? `<div class="alert-banner error" role="alert" style="margin-top: 12px;">${escapeHtml(errorMessage)}</div>`
      : "";

    let actionHtml = "";
    if (isSaved) {
      const linkUrl = savedLink || templateUrl;
      const linkLabel = savedLink
        ? "登録したGoogleカレンダーの予定を開く"
        : "もう一度Googleカレンダーを開く";
      actionHtml = `
        <div style="margin-top: 16px; display:flex; flex-direction:column; gap:10px;">
          <a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-block">${linkLabel}</a>
        </div>
      `;
    } else if (hasClientId) {
      const btnLabel = isSaving
        ? "記録中..."
        : currentStatus === "error"
          ? "Googleカレンダーに記録（再試行）"
          : "Googleカレンダーに記録";
      actionHtml = `
        <div style="margin-top: 16px; display:flex; flex-direction:column; gap:10px;">
          <button
            type="button"
            class="btn btn-primary btn-block"
            id="btn-save-calendar-api"
            ${isSaving ? "disabled" : ""}
          >
            ${btnLabel}
          </button>
          <a
            href="${escapeHtml(templateUrl)}"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-secondary btn-block"
            id="btn-save-calendar-template"
          >
            予定作成画面を別タブで開く（URL連携）
          </a>
          <p class="muted-text" style="margin-top:2px; font-size:0.85rem;">
            Googleアカウントで認証し、メインカレンダー（primary）へ直接記録します。
          </p>
        </div>
      `;
    } else {
      actionHtml = `
        <div style="margin-top: 16px;">
          <a href="${escapeHtml(templateUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-block" id="btn-save-calendar">
            Googleカレンダーに予定を作成
          </a>
          <p class="muted-text" style="margin-top:8px; font-size:0.85rem;">
            別タブでGoogleカレンダーの予定作成画面が開きます。内容を確認して「保存」を押してください。
          </p>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="view-header">
        <div class="view-header-top">
          <button type="button" class="btn btn-secondary" id="btn-done-home">← 一覧へ</button>
        </div>
        <h1>ルーティン完了</h1>
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
        ${errorHtml}
        ${actionHtml}
      </section>

      <div class="primary-cta-wrap">
        <button type="button" class="btn btn-secondary btn-block" data-action="back-home">一覧へ戻る</button>
      </div>
    `;

    container.querySelector("#btn-done-home")?.addEventListener("click", () => {
      actions.onBackHome();
    });
    container.querySelector('[data-action="back-home"]')?.addEventListener("click", () => {
      actions.onBackHome();
    });

    container.querySelector("#btn-save-calendar-api")?.addEventListener("click", async () => {
      if (currentStatus === "saving" || currentStatus === "saved") return;
      currentStatus = "saving";
      errorMessage = "";
      renderContent();

      try {
        const saved = await saveResultToGoogleCalendar(result);
        currentStatus = "saved";
        savedLink = saved.htmlLink || "";
        actions.onSaved(result.executionId, savedLink);
      } catch (err) {
        currentStatus = "error";
        errorMessage = err?.message || "Googleカレンダーへの記録に失敗しました。";
      }
      renderContent();
    });

    container.querySelector("#btn-save-calendar-template")?.addEventListener("click", () => {
      if (currentStatus === "saving" || currentStatus === "saved") return;
      currentStatus = "saved";
      savedLink = templateUrl;
      actions.onSaved(result.executionId, templateUrl);
      renderContent();
    });

    container.querySelector("#btn-save-calendar")?.addEventListener("click", () => {
      if (currentStatus === "saved") return;
      currentStatus = "saved";
      savedLink = templateUrl;
      actions.onSaved(result.executionId, templateUrl);
      renderContent();
    });
  };

  renderContent();
}
