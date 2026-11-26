// 共通アクションメニュー（ボトムシート風モーダル）
import { escapeHtml } from "./models.js";

/**
 * アクションメニューを開く
 * @param {object} options
 * @param {string} [options.title] メニュー見出し
 * @param {string} [options.subtitle] 補足テキスト
 * @param {Array<{label: string, variant?: "primary"|"secondary"|"danger"|"warn", disabled?: boolean, onSelect?: () => void}>} [options.items]
 */
export function openActionMenu({ title = "操作を選択", subtitle = "", items = [] }) {
  const prevFocused = document.activeElement;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop action-sheet-backdrop";

  const itemsHtml = items
    .map((item, idx) => {
      const variantClass = item.variant ? `btn-${item.variant}` : "btn-secondary";
      return `
        <button
          type="button"
          class="btn ${variantClass} btn-block action-sheet-btn"
          data-action-idx="${idx}"
          ${item.disabled ? "disabled" : ""}
        >${escapeHtml(item.label)}</button>
      `;
    })
    .join("");

  backdrop.innerHTML = `
    <div class="modal-dialog action-sheet-dialog" role="dialog" aria-modal="true" aria-labelledby="action-sheet-title">
      <div class="action-sheet-header">
        <h2 id="action-sheet-title" class="action-sheet-title">${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="muted-text action-sheet-subtitle">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      <div class="action-sheet-list">
        ${itemsHtml}
      </div>
      <div class="action-sheet-cancel">
        <button type="button" class="btn btn-secondary btn-block" id="btn-action-sheet-cancel">キャンセル</button>
      </div>
    </div>
  `;

  const close = (restoreFocus = true) => {
    document.removeEventListener("keydown", handleKeyDown);
    backdrop.remove();
    if (restoreFocus && prevFocused && typeof prevFocused.focus === "function") {
      prevFocused.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    }
  };

  document.addEventListener("keydown", handleKeyDown);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close(true);
  });

  backdrop.querySelector("#btn-action-sheet-cancel")?.addEventListener("click", () => {
    close(true);
  });

  backdrop.querySelectorAll("[data-action-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.actionIdx);
      const item = items[idx];
      if (!item || item.disabled) return;
      close(false);
      item.onSelect?.();
    });
  });

  document.body.appendChild(backdrop);

  const firstFocusable = backdrop.querySelector(".action-sheet-btn:not(:disabled), #btn-action-sheet-cancel");
  firstFocusable?.focus();

  return close;
}
