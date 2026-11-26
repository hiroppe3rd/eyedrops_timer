// SCR-02: ルーティン作成・編集画面（時間設定ダイアログ含む）
import { openActionMenu } from "../actionMenu.js";
import {
  DURATION_TEMPLATES,
  MEDICATION_TEMPLATES,
  STEP_TYPES,
  appendMedicationsRemovingEmpty,
  calcWaitRemainderSeconds,
  cloneMedicationForAdd,
  createDefaultMedication,
  createId,
  escapeHtml,
  extractExistingMedications,
  formatDuration,
  getStepLabel,
  normalizeRoutineSteps,
  parseDurationInput,
  validateRoutine,
} from "../models.js";

/** 作成・編集画面の描画 */
export function renderRoutineEditView(container, draftRoutine, isNew, actions) {
  // 末尾の待機工程ルールを反映して作業コピーを作成
  let draft = {
    ...draftRoutine,
    medications: normalizeRoutineSteps(draftRoutine.medications).map((med) => ({
      ...med,
      id: med.id || createId("med"),
    })),
  };
  let validationErrors = [];
  let pendingEffect = null;
  let isRemoving = false;

  const renderForm = () => {
    const medsHtml = draft.medications
      .map((med, medIdx) => {
        const isLast = medIdx === draft.medications.length - 1;
        const meditationSec =
          Number(med.steps.find((s) => s.type === STEP_TYPES.MEDITATION)?.durationSec) || 0;
        const remainderSec = calcWaitRemainderSeconds(med);
        const stepsHtml = med.steps
          .map((step) => {
            if (isLast && step.type === STEP_TYPES.WAIT) return "";
            const stepTitle = getStepLabel(step.type);
            let waitHintHtml = "";
            if (step.type === STEP_TYPES.WAIT) {
              const waitSec = Number(step.durationSec) || 0;
              if (waitSec > 0 && waitSec < meditationSec) {
                waitHintHtml = `<div class="muted-text" style="font-size:0.8rem; margin-top:4px;">※ 閉眼時間より短いため、追加の待機時間は 0秒 になります</div>`;
              } else if (waitSec > 0) {
                waitHintHtml = `<div class="muted-text" style="font-size:0.8rem; margin-top:4px;">閉眼後の残り待機時間: ${escapeHtml(formatDuration(remainderSec))}（閉眼を早めに終えても間隔 ${escapeHtml(formatDuration(waitSec))} を維持します）</div>`;
              }
            }
            return `
              <div class="step-field">
                <div class="step-input-row">
                  <span class="step-fixed-label">${escapeHtml(stepTitle)}</span>
                  <button
                    type="button"
                    class="btn btn-duration"
                    data-action="open-duration"
                    data-med-idx="${medIdx}"
                    data-step-type="${step.type}"
                  >${escapeHtml(formatDuration(step.durationSec))}</button>
                </div>
                ${waitHintHtml}
              </div>
            `;
          })
          .join("");

        return `
          <div class="card med-card" draggable="true" data-med-idx="${medIdx}" data-med-id="${escapeHtml(med.id)}">
            <div class="med-card-head">
              <div class="med-title-wrap">
                <span class="drag-handle" title="ドラッグして並び替え" aria-label="薬の並び替えハンドル">☰</span>
                <strong>薬 ${medIdx + 1}${isLast ? "（最後）" : ""}</strong>
              </div>
              <div class="med-card-actions">
                <button
                  type="button"
                  class="btn btn-secondary btn-icon-menu"
                  data-action="med-menu"
                  data-med-idx="${medIdx}"
                  aria-label="薬 ${medIdx + 1} のメニューを開く"
                >⋯</button>
              </div>
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
            <div class="form-group">
              <label class="field-label">備考（任意・読み上げ対象外）</label>
              <input
                type="text"
                class="text-input med-note-input"
                data-med-idx="${medIdx}"
                value="${escapeHtml(med.note || "")}"
                placeholder="例: 1回1滴、目頭を軽く押さえる"
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
        <div class="view-header-top">
          <button type="button" class="btn btn-secondary" id="btn-back">← 一覧へ</button>
          ${
            !isNew
              ? `<button type="button" class="btn btn-secondary btn-icon-menu" id="btn-routine-menu" aria-label="ルーティンのメニューを開く">⋯</button>`
              : ""
          }
        </div>
        <h1>${isNew ? "ルーティン新規作成" : "ルーティン編集"}</h1>
      </div>
      ${errorsHtml}
      <div class="card">
        <div class="form-group" style="margin-bottom:0;">
          <label class="field-label" for="routine-name-input">ルーティン名（必須）</label>
          <input
            id="routine-name-input"
            type="text"
            class="text-input"
            value="${escapeHtml(draft.name)}"
            placeholder="例: 朝の点眼セット"
          >
        </div>
      </div>
      <div id="medications-list">${medsHtml}</div>
      <div class="edit-add-actions">
        <button type="button" class="btn btn-secondary" id="btn-add-med">＋ 点眼薬を追加</button>
        <button type="button" class="btn btn-secondary" id="btn-add-from-template">📋 よく使う薬／登録済みから追加</button>
      </div>
      <div class="primary-cta-wrap">
        <button type="button" class="btn btn-primary btn-block" id="btn-save-routine">保存</button>
      </div>
    `;

    bindEvents();
    applyPendingEffect();
  };

  /** 画面再描画後の行程カードアニメーション適用 */
  const applyPendingEffect = () => {
    if (!pendingEffect) return;
    const effect = pendingEffect;
    pendingEffect = null;

    const listEl = container.querySelector("#medications-list");
    if (!listEl) return;

    if (effect.type === "enter" || effect.type === "duplicate") {
      const cls = effect.type === "duplicate" ? "med-card-duplicate" : "med-card-enter";
      const targets = (effect.ids || [])
        .map((id) => listEl.querySelector(`.med-card[data-med-id="${CSS.escape(id)}"]`))
        .filter(Boolean);

      targets.forEach((card) => {
        card.classList.add(cls);
        card.addEventListener("animationend", () => card.classList.remove(cls), { once: true });
      });

      if (targets[0] && typeof targets[0].scrollIntoView === "function") {
        targets[0].scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return;
    }

    if (effect.type === "move" && effect.prevRects) {
      const cards = Array.from(listEl.querySelectorAll(".med-card"));
      const animatedCards = [];

      // FLIP: 移動前後の位置差分から逆方向にずらして配置
      cards.forEach((card) => {
        const id = card.dataset.medId;
        const prevTop = effect.prevRects.get(id);
        if (prevTop === undefined) return;
        const deltaY = prevTop - card.getBoundingClientRect().top;
        if (Math.abs(deltaY) < 0.5) return;
        card.style.transition = "none";
        card.style.transform = `translateY(${deltaY}px)`;
        animatedCards.push(card);
      });

      if (animatedCards.length > 0) {
        // 強制リフロー後にトランジションを有効化して元の位置へ戻す
        void listEl.offsetHeight;
        requestAnimationFrame(() => {
          animatedCards.forEach((card) => {
            card.style.transition = "";
            card.style.transform = "";
          });
        });
      }

      if (effect.movedId) {
        const movedCard = listEl.querySelector(`.med-card[data-med-id="${CSS.escape(effect.movedId)}"]`);
        if (movedCard) {
          movedCard.classList.add("med-card-moved");
          movedCard.addEventListener(
            "animationend",
            () => movedCard.classList.remove("med-card-moved"),
            { once: true }
          );
        }
      }
    }
  };

  const syncInputsFromDom = () => {
    const nameInput = container.querySelector("#routine-name-input");
    if (nameInput) draft.name = nameInput.value;

    container.querySelectorAll(".med-name-input").forEach((input) => {
      const idx = Number(input.dataset.medIdx);
      if (draft.medications[idx]) {
        draft.medications[idx].name = input.value;
      }
    });

    container.querySelectorAll(".med-note-input").forEach((input) => {
      const idx = Number(input.dataset.medIdx);
      if (draft.medications[idx]) {
        draft.medications[idx].note = input.value;
      }
    });
  };

  const bindEvents = () => {
    container.querySelector("#btn-back")?.addEventListener("click", () => {
      actions.onCancel();
    });

    container.querySelector("#btn-save-routine")?.addEventListener("click", () => {
      if (isRemoving) return;
      syncInputsFromDom();
      draft.medications = normalizeRoutineSteps(draft.medications);
      validationErrors = validateRoutine(draft);
      if (validationErrors.length > 0) {
        renderForm();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      actions.onSave(draft);
    });

    container.querySelector("#btn-add-med")?.addEventListener("click", () => {
      if (isRemoving) return;
      syncInputsFromDom();
      const newMed = createDefaultMedication(true);
      draft.medications.push(newMed);
      draft.medications = normalizeRoutineSteps(draft.medications);
      pendingEffect = { type: "enter", ids: [newMed.id] };
      renderForm();
    });

    container.querySelector("#btn-add-from-template")?.addEventListener("click", () => {
      if (isRemoving) return;
      syncInputsFromDom();
      const existingRoutines = Array.isArray(actions?.existingRoutines) ? actions.existingRoutines : [];
      openMedicationPickerDialog(existingRoutines, (selectedItems) => {
        if (!selectedItems.length) return;
        const added = selectedItems.map((item) => cloneMedicationForAdd(item));
        draft.medications = appendMedicationsRemovingEmpty(draft.medications, added);
        pendingEffect = { type: "enter", ids: added.map((m) => m.id) };
        renderForm();
      });
    });

    container.querySelector("#btn-routine-menu")?.addEventListener("click", () => {
      if (isRemoving) return;
      openActionMenu({
        title: draft.name || "ルーティン",
        items: [
          {
            label: "このルーティンを削除",
            variant: "danger",
            onSelect: () => actions.onDelete?.(draft.id),
          },
        ],
      });
    });

    const duplicateMedAt = (idx) => {
      if (isRemoving) return;
      syncInputsFromDom();
      const target = draft.medications[idx];
      if (!target) return;
      const cloned = cloneMedicationForAdd(target);
      draft.medications.splice(idx + 1, 0, cloned);
      draft.medications = normalizeRoutineSteps(draft.medications);
      pendingEffect = { type: "duplicate", ids: [cloned.id] };
      renderForm();
    };

    const removeMedAt = (idx, card) => {
      if (isRemoving || draft.medications.length <= 1) return;
      const targetMed = draft.medications[idx];
      if (!targetMed) return;

      const performRemove = () => {
        syncInputsFromDom();
        const removeIdx = draft.medications.findIndex((m) => m.id === targetMed.id);
        if (removeIdx !== -1 && draft.medications.length > 1) {
          draft.medications.splice(removeIdx, 1);
        }
        draft.medications = normalizeRoutineSteps(draft.medications);
        isRemoving = false;
        renderForm();
      };

      if (!card) {
        performRemove();
        return;
      }

      // 枠を上下に縮小して消した後に配列から除外して再描画
      isRemoving = true;
      let done = false;
      const onTransitionEnd = (e) => {
        if (e.target === card && e.propertyName === "height") {
          finishRemove();
        }
      };
      const finishRemove = () => {
        if (done) return;
        done = true;
        card.removeEventListener("transitionend", onTransitionEnd);
        performRemove();
      };

      card.style.height = `${card.offsetHeight}px`;
      card.classList.add("med-card-removing");
      void card.offsetHeight;
      requestAnimationFrame(() => {
        card.classList.add("is-collapsing");
        card.style.height = "0px";
      });
      card.addEventListener("transitionend", onTransitionEnd);
      setTimeout(finishRemove, 600);
    };

    container.querySelectorAll('[data-action="med-menu"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        if (isRemoving) return;
        syncInputsFromDom();
        const idx = Number(btn.dataset.medIdx);
        const targetMed = draft.medications[idx];
        if (!targetMed) return;
        const card = btn.closest(".med-card");
        openActionMenu({
          title: `薬 ${idx + 1}`,
          subtitle: targetMed.name || "薬名未入力",
          items: [
            {
              label: "この薬を複製",
              variant: "secondary",
              onSelect: () => duplicateMedAt(idx),
            },
            {
              label: "この薬を削除",
              variant: "danger",
              disabled: draft.medications.length <= 1,
              onSelect: () => removeMedAt(idx, card),
            },
          ],
        });
      });
    });

    container.querySelectorAll('[data-action="open-duration"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        if (isRemoving) return;
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
      if (isRemoving) return;
      const listEl = container.querySelector("#medications-list");
      const prevRects = captureCardRects(listEl);
      syncInputsFromDom();
      const [moved] = draft.medications.splice(fromIdx, 1);
      draft.medications.splice(toIdx, 0, moved);
      draft.medications = normalizeRoutineSteps(draft.medications);
      pendingEffect = { type: "move", movedId: moved?.id, prevRects };
      renderForm();
    });
  };

  renderForm();
}

/** 移動前後の位置比較用に各カードのY座標を収集 */
function captureCardRects(listEl) {
  const rects = new Map();
  if (!listEl) return rects;
  listEl.querySelectorAll(".med-card").forEach((card) => {
    const id = card.dataset.medId;
    if (id) rects.set(id, card.getBoundingClientRect().top);
  });
  return rects;
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
  const presetSecondsSet = new Set([0, ...DURATION_TEMPLATES.map((tpl) => tpl.seconds)]);

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="duration-modal-title">
      <h2 id="duration-modal-title">${escapeHtml(getStepLabel(step.type))} の時間設定</h2>
      <div class="modal-section">
        <label class="field-label" for="duration-preset-select">よく使う時間</label>
        <select id="duration-preset-select" class="select-input">
          <option value="">手入力（カスタム）</option>
          <option value="0" ${initialSec === 0 ? "selected" : ""}>0秒（省略）</option>
          ${DURATION_TEMPLATES.map(
            (tpl) => `<option value="${tpl.seconds}" ${initialSec === tpl.seconds ? "selected" : ""}>${tpl.label}</option>`
          ).join("")}
        </select>
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

  const presetSelect = backdrop.querySelector("#duration-preset-select");
  const valueInput = backdrop.querySelector("#manual-duration-value");
  const unitSelect = backdrop.querySelector("#manual-duration-unit");
  const previewEl = backdrop.querySelector("#duration-preview");
  const okBtn = backdrop.querySelector("#btn-duration-ok");

  const updatePreview = (syncPreset = true) => {
    const sec = parseDurationInput(valueInput.value, unitSelect.value);
    if (sec === null) {
      previewEl.textContent = "0秒以上の整数（分指定時は秒換算で整数）を入力してください";
      previewEl.classList.add("is-error");
      okBtn.disabled = true;
      if (syncPreset && presetSelect) presetSelect.value = "";
      return null;
    }
    previewEl.textContent = `設定時間: ${formatDuration(sec)}（${sec}秒）`;
    previewEl.classList.remove("is-error");
    okBtn.disabled = false;
    if (syncPreset && presetSelect) {
      presetSelect.value = presetSecondsSet.has(sec) ? String(sec) : "";
    }
    return sec;
  };

  // よく使う時間セレクト変更時に手入力欄へ反映
  presetSelect?.addEventListener("change", () => {
    if (presetSelect.value === "") return;
    const sec = Number(presetSelect.value);
    if (sec >= 60 && sec % 6 === 0) {
      unitSelect.value = "min";
      valueInput.value = String(sec / 60);
    } else {
      unitSelect.value = "sec";
      valueInput.value = String(sec);
    }
    updatePreview(false);
  });

  valueInput.addEventListener("input", () => updatePreview(true));
  unitSelect.addEventListener("change", () => updatePreview(true));

  const close = () => backdrop.remove();

  backdrop.querySelector("#btn-duration-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  okBtn.addEventListener("click", () => {
    const sec = updatePreview(true);
    if (sec === null) return;
    close();
    onConfirm(sec);
  });

  updatePreview(true);
  valueInput.focus();
}

/** テンプレート・既存行程選択ダイアログを開く */
function openMedicationPickerDialog(existingRoutines, onConfirm) {
  const existingItems = extractExistingMedications(existingRoutines);
  let activeTab = "templates";
  let searchQuery = "";
  const selectedTemplates = new Set();
  const selectedExisting = new Set();

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const formatStepsSummary = (steps) =>
    (steps || [])
      .map((s) => `${getStepLabel(s.type)} ${formatDuration(s.durationSec)}`)
      .join(" / ");

  const renderDialog = () => {
    const totalSelected = selectedTemplates.size + selectedExisting.size;
    const query = searchQuery.trim().toLowerCase();

    let listHtml = "";
    if (activeTab === "templates") {
      listHtml = MEDICATION_TEMPLATES.map((tpl) => {
        const isSelected = selectedTemplates.has(tpl.templateId);
        return `
          <label class="picker-item ${isSelected ? "is-selected" : ""}">
            <input type="checkbox" class="picker-checkbox" data-kind="template" data-key="${escapeHtml(tpl.templateId)}" ${isSelected ? "checked" : ""}>
            <div class="picker-item-body">
              <div class="picker-item-title">${escapeHtml(tpl.title)}</div>
              <div class="picker-item-sub">薬名: ${escapeHtml(tpl.name)}${tpl.note ? ` ／ 備考: ${escapeHtml(tpl.note)}` : ""}</div>
              <div class="picker-item-steps">${escapeHtml(formatStepsSummary(tpl.steps))}</div>
            </div>
          </label>
        `;
      }).join("");
    } else {
      const filtered = existingItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => {
          if (!query) return true;
          const haystack = [item.name, item.note, ...(item.sourceRoutineNames || [])]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        });

      if (existingItems.length === 0) {
        listHtml = `<div class="picker-empty">登録済みの点眼薬がまだありません。</div>`;
      } else if (filtered.length === 0) {
        listHtml = `<div class="picker-empty">条件に一致する点眼薬が見つかりません。</div>`;
      } else {
        listHtml = filtered
          .map(({ item, idx }) => {
            const isSelected = selectedExisting.has(idx);
            const sourcesHtml = (item.sourceRoutineNames || [])
              .map((rn) => `<span class="picker-source-badge">${escapeHtml(rn)}</span>`)
              .join("");
            return `
              <label class="picker-item ${isSelected ? "is-selected" : ""}">
                <input type="checkbox" class="picker-checkbox" data-kind="existing" data-key="${idx}" ${isSelected ? "checked" : ""}>
                <div class="picker-item-body">
                  <div class="picker-item-title">${escapeHtml(item.name)}</div>
                  ${item.note ? `<div class="picker-item-sub">備考: ${escapeHtml(item.note)}</div>` : ""}
                  <div class="picker-item-steps">${escapeHtml(formatStepsSummary(item.steps))}</div>
                  <div class="picker-item-sources">${sourcesHtml}</div>
                </div>
              </label>
            `;
          })
          .join("");
      }
    }

    backdrop.innerHTML = `
      <div class="modal-dialog modal-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="picker-modal-title">
        <h2 id="picker-modal-title">よく使う薬／登録済みから追加</h2>
        <div class="modal-tabs" role="tablist">
          <button type="button" role="tab" aria-selected="${activeTab === "templates"}" class="modal-tab ${activeTab === "templates" ? "is-active" : ""}" data-tab="templates">よく使う薬</button>
          <button type="button" role="tab" aria-selected="${activeTab === "existing"}" class="modal-tab ${activeTab === "existing" ? "is-active" : ""}" data-tab="existing">登録済みの薬 (${existingItems.length})</button>
        </div>
        ${
          activeTab === "templates"
            ? `<p class="muted-text" style="margin:0 0 10px; font-size:0.84rem;">※ よく使う薬の時間は一般的な目安です。医師・薬剤師の指示がある場合はそちらを優先してください。</p>`
            : ""
        }
        ${
          activeTab === "existing"
            ? `<div class="picker-search-wrap">
                <input type="text" id="picker-search-input" class="text-input" value="${escapeHtml(searchQuery)}" placeholder="薬名・備考・ルーティン名で絞り込み">
              </div>`
            : ""
        }
        <div class="picker-list">${listHtml}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="btn-picker-cancel">キャンセル</button>
          <button type="button" class="btn btn-primary" id="btn-picker-ok" ${totalSelected === 0 ? "disabled" : ""}>追加する (${totalSelected}件)</button>
        </div>
      </div>
    `;

    bindDialogEvents();
  };

  const close = () => backdrop.remove();

  const bindDialogEvents = () => {
    backdrop.querySelectorAll("[data-tab]").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        activeTab = tabBtn.dataset.tab;
        renderDialog();
      });
    });

    const searchInput = backdrop.querySelector("#picker-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value;
        const caret = searchInput.selectionStart ?? searchQuery.length;
        renderDialog();
        const nextInput = backdrop.querySelector("#picker-search-input");
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(caret, caret);
        }
      });
    }

    backdrop.querySelectorAll(".picker-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const kind = checkbox.dataset.kind;
        const key = checkbox.dataset.key;
        if (kind === "template") {
          if (checkbox.checked) selectedTemplates.add(key);
          else selectedTemplates.delete(key);
        } else {
          const idx = Number(key);
          if (checkbox.checked) selectedExisting.add(idx);
          else selectedExisting.delete(idx);
        }
        renderDialog();
      });
    });

    backdrop.querySelector("#btn-picker-cancel")?.addEventListener("click", close);
    backdrop.querySelector("#btn-picker-ok")?.addEventListener("click", () => {
      const picked = [
        ...MEDICATION_TEMPLATES.filter((t) => selectedTemplates.has(t.templateId)),
        ...Array.from(selectedExisting)
          .sort((a, b) => a - b)
          .map((idx) => existingItems[idx])
          .filter(Boolean),
      ];
      close();
      onConfirm(picked);
    });
  };

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  document.body.appendChild(backdrop);
  renderDialog();
}
