// SCR-02: ワークアウト作成・編集画面（時間設定ダイアログ含む）
import {
  DURATION_TEMPLATES,
  STEP_TYPES,
  createDefaultMedication,
  escapeHtml,
  formatDuration,
  normalizeWorkoutSteps,
  parseDurationInput,
  validateWorkout,
} from "../models.js";

/** 作成・編集画面の描画 */
export function renderWorkoutEditView(container, draftWorkout, isNew, actions) {
  // 末尾の待機工程ルールを反映して作業コピーを作成
  let draft = {
    ...draftWorkout,
    medications: normalizeWorkoutSteps(draftWorkout.medications),
  };
  let validationErrors = [];

  const renderForm = () => {
    const medsHtml = draft.medications
      .map((med, medIdx) => {
        const isLast = medIdx === draft.medications.length - 1;
        const stepsHtml = med.steps
          .map((step) => {
            if (isLast && step.type === STEP_TYPES.WAIT) return "";
            const stepTitle = getStepTypeTitle(step.type);
            return `
              <div class="step-field">
                <label class="field-label">${stepTitle}（表示名 / 時間）</label>
                <div class="step-input-row">
                  <input
                    type="text"
                    class="text-input step-label-input"
                    data-med-idx="${medIdx}"
                    data-step-type="${step.type}"
                    value="${escapeHtml(step.label)}"
                    placeholder="${stepTitle}"
                  >
                  <button
                    type="button"
                    class="btn btn-duration"
                    data-action="open-duration"
                    data-med-idx="${medIdx}"
                    data-step-type="${step.type}"
                  >${escapeHtml(formatDuration(step.durationSec))}</button>
                </div>
              </div>
            `;
          })
          .join("");

        return `
          <div class="card med-card" draggable="true" data-med-idx="${medIdx}">
            <div class="med-card-head">
              <div class="med-title-wrap">
                <span class="drag-handle" title="ドラッグして並び替え" aria-label="薬の並び替えハンドル">☰</span>
                <strong>薬 ${medIdx + 1}${isLast ? "（最後）" : ""}</strong>
              </div>
              <button
                type="button"
                class="btn btn-danger btn-sm"
                data-action="remove-med"
                data-med-idx="${medIdx}"
                ${draft.medications.length <= 1 ? "disabled" : ""}
              >薬削除</button>
            </div>
            <div class="form-group">
              <label class="field-label">薬名（必須）</label>
              <input
                type="text"
                class="text-input med-name-input"
                data-med-idx="${medIdx}"
                value="${escapeHtml(med.name)}"
                placeholder="例: ヒアルロン酸点眼液"
              >
            </div>
            ${stepsHtml}
            ${isLast ? '<p class="muted-text" style="margin:6px 0 0; font-size:0.82rem;">※ 最後の点眼薬には待機工程を設けません</p>' : ""}
          </div>
        `;
      })
      .join("");

    const errorsHtml = validationErrors.length
      ? `<div class="alert-banner error" role="alert">
          <ul>${validationErrors.map((msg) => `<li>${escapeHtml(msg)}</li>`).join("")}</ul>
        </div>`
      : "";

    container.innerHTML = `
      <div class="view-header">
        <button type="button" class="btn btn-secondary" id="btn-back">← 戻る</button>
        <h1>${isNew ? "ワークアウト新規作成" : "ワークアウト編集"}</h1>
        <button type="button" class="btn btn-primary" id="btn-save-workout">保存</button>
      </div>
      ${errorsHtml}
      <div class="card">
        <div class="form-group" style="margin-bottom:0;">
          <label class="field-label" for="workout-name-input">ワークアウト名（必須）</label>
          <input
            id="workout-name-input"
            type="text"
            class="text-input"
            value="${escapeHtml(draft.name)}"
            placeholder="例: 朝の点眼セット"
          >
        </div>
      </div>
      <div id="medications-list">${medsHtml}</div>
      <div style="margin-top: 12px;">
        <button type="button" class="btn btn-secondary" id="btn-add-med">＋ 点眼薬を追加</button>
      </div>
    `;

    bindEvents();
  };

  const syncInputsFromDom = () => {
    const nameInput = container.querySelector("#workout-name-input");
    if (nameInput) draft.name = nameInput.value;

    container.querySelectorAll(".med-name-input").forEach((input) => {
      const idx = Number(input.dataset.medIdx);
      if (draft.medications[idx]) {
        draft.medications[idx].name = input.value;
      }
    });

    container.querySelectorAll(".step-label-input").forEach((input) => {
      const idx = Number(input.dataset.medIdx);
      const type = input.dataset.stepType;
      const step = draft.medications[idx]?.steps.find((s) => s.type === type);
      if (step) step.label = input.value;
    });
  };

  const bindEvents = () => {
    container.querySelector("#btn-back")?.addEventListener("click", () => {
      actions.onCancel();
    });

    container.querySelector("#btn-save-workout")?.addEventListener("click", () => {
      syncInputsFromDom();
      draft.medications = normalizeWorkoutSteps(draft.medications);
      validationErrors = validateWorkout(draft);
      if (validationErrors.length > 0) {
        renderForm();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      actions.onSave(draft);
    });

    container.querySelector("#btn-add-med")?.addEventListener("click", () => {
      syncInputsFromDom();
      draft.medications.push(createDefaultMedication(true));
      draft.medications = normalizeWorkoutSteps(draft.medications);
      renderForm();
    });

    container.querySelectorAll('[data-action="remove-med"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        syncInputsFromDom();
        const idx = Number(btn.dataset.medIdx);
        if (draft.medications.length <= 1) return;
        draft.medications.splice(idx, 1);
        draft.medications = normalizeWorkoutSteps(draft.medications);
        renderForm();
      });
    });

    container.querySelectorAll('[data-action="open-duration"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        syncInputsFromDom();
        const medIdx = Number(btn.dataset.medIdx);
        const stepType = btn.dataset.stepType;
        const step = draft.medications[medIdx]?.steps.find((s) => s.type === stepType);
        if (!step) return;

        openDurationDialog(step, (newSeconds) => {
          step.durationSec = newSeconds;
          renderForm();
        });
      });
    });

    setupMedicationDragAndDrop(container.querySelector("#medications-list"), (fromIdx, toIdx) => {
      syncInputsFromDom();
      const [moved] = draft.medications.splice(fromIdx, 1);
      draft.medications.splice(toIdx, 0, moved);
      draft.medications = normalizeWorkoutSteps(draft.medications);
      renderForm();
    });
  };

  renderForm();
}

/** 工程種別の表示ラベル */
function getStepTypeTitle(type) {
  if (type === STEP_TYPES.PREPARE) return "準備";
  if (type === STEP_TYPES.MEDITATION) return "直後の瞑想";
  if (type === STEP_TYPES.WAIT) return "次の点眼までの待機";
  return "工程";
}

/** 点眼薬のドラッグ＆ドロップ並び替え */
function setupMedicationDragAndDrop(listEl, onMove) {
  if (!listEl) return;
  let draggingIdx = null;

  listEl.querySelectorAll(".med-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      draggingIdx = Number(card.dataset.medIdx);
      card.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      draggingIdx = null;
      card.classList.remove("is-dragging");
      listEl.querySelectorAll(".med-card").forEach((el) => el.classList.remove("drag-over"));
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      const targetIdx = Number(card.dataset.medIdx);
      if (draggingIdx === null || draggingIdx === targetIdx) return;
      card.classList.add("drag-over");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      const targetIdx = Number(card.dataset.medIdx);
      if (draggingIdx === null || draggingIdx === targetIdx) return;
      onMove(draggingIdx, targetIdx);
    });
  });
}

/** 時間設定ダイアログを開く */
function openDurationDialog(step, onConfirm) {
  const initialSec = Number(step.durationSec) || 0;
  const useMinDefault = initialSec >= 60 && initialSec % 6 === 0;
  const currentUnit = useMinDefault ? "min" : "sec";
  const currentValue = useMinDefault ? String(initialSec / 60) : String(initialSec);

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="duration-modal-title">
      <h2 id="duration-modal-title">${escapeHtml(step.label || getStepTypeTitle(step.type))} の時間設定</h2>
      <div class="modal-section">
        <div class="field-label">テンプレートから選択</div>
        <div class="template-grid">
          <button type="button" class="btn btn-chip" data-tpl-sec="0">0秒（省略）</button>
          ${DURATION_TEMPLATES.map(
            (tpl) => `<button type="button" class="btn btn-chip" data-tpl-sec="${tpl.seconds}">${tpl.label}</button>`
          ).join("")}
        </div>
      </div>
      <div class="modal-section">
        <label class="field-label" for="manual-duration-value">手入力（数値 ＋ 秒／分）</label>
        <div class="manual-duration-row">
          <input id="manual-duration-value" type="number" min="0" step="any" class="text-input" value="${escapeHtml(currentValue)}">
          <select id="manual-duration-unit" class="select-input">
            <option value="sec" ${currentUnit === "sec" ? "selected" : ""}>秒</option>
            <option value="min" ${currentUnit === "min" ? "selected" : ""}>分</option>
          </select>
        </div>
        <div class="duration-preview" id="duration-preview"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="btn-duration-cancel">キャンセル</button>
        <button type="button" class="btn btn-primary" id="btn-duration-ok">決定</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const valueInput = backdrop.querySelector("#manual-duration-value");
  const unitSelect = backdrop.querySelector("#manual-duration-unit");
  const previewEl = backdrop.querySelector("#duration-preview");
  const okBtn = backdrop.querySelector("#btn-duration-ok");

  const updatePreview = () => {
    const sec = parseDurationInput(valueInput.value, unitSelect.value);
    if (sec === null) {
      previewEl.textContent = "0秒以上の整数（分指定時は秒換算で整数）を入力してください";
      previewEl.classList.add("is-error");
      okBtn.disabled = true;
      return null;
    }
    previewEl.textContent = `設定時間: ${formatDuration(sec)}（${sec}秒）`;
    previewEl.classList.remove("is-error");
    okBtn.disabled = false;
    return sec;
  };

  // テンプレートボタン押下で手入力欄へ反映
  backdrop.querySelectorAll("[data-tpl-sec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sec = Number(btn.dataset.tplSec);
      if (sec >= 60 && sec % 6 === 0) {
        unitSelect.value = "min";
        valueInput.value = String(sec / 60);
      } else {
        unitSelect.value = "sec";
        valueInput.value = String(sec);
      }
      updatePreview();
    });
  });

  valueInput.addEventListener("input", updatePreview);
  unitSelect.addEventListener("change", updatePreview);

  const close = () => backdrop.remove();

  backdrop.querySelector("#btn-duration-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  okBtn.addEventListener("click", () => {
    const sec = updatePreview();
    if (sec === null) return;
    close();
    onConfirm(sec);
  });

  updatePreview();
  valueInput.focus();
}
