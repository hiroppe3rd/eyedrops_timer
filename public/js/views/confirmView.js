// SCR-03: 開始前確認・音声設定画面
import { calcWorkoutTotalSeconds, escapeHtml, formatDuration } from "../models.js";
import { VOICE_RATES, resolvePreferredVoice } from "../speech.js";

/** 開始前確認・音声設定画面の描画 */
export function renderConfirmView(container, workout, voiceSettings, speech, actions) {
  const totalSec = calcWorkoutTotalSeconds(workout);
  let currentSettings = { ...voiceSettings };

  const renderContent = () => {
    const voices = speech.getVoices();
    const resolvedVoice = resolvePreferredVoice(voices, currentSettings.voiceName);
    const activeVoiceName = resolvedVoice ? resolvedVoice.name : currentSettings.voiceName;

    const voiceOptionsHtml = voices.length
      ? voices
          .map(
            (v) =>
              `<option value="${escapeHtml(v.name)}" ${v.name === activeVoiceName ? "selected" : ""}>${escapeHtml(
                v.name
              )} (${escapeHtml(v.lang)})</option>`
          )
          .join("")
      : `<option value="">音声合成が利用できません（効果音＋画面通知で動作）</option>`;

    const ratesHtml = VOICE_RATES.map(
      (r) => `
        <button
          type="button"
          class="btn ${Number(currentSettings.rate) === r.value ? "btn-primary" : "btn-secondary"}"
          data-rate="${r.value}"
        >${escapeHtml(r.label)}</button>
      `
    ).join("");

    container.innerHTML = `
      <div class="view-header">
        <button type="button" class="btn btn-secondary" id="btn-back-list">← 一覧へ</button>
        <h1>開始前確認</h1>
        <span></span>
      </div>

      <section class="card">
        <h2 style="margin-top:0;">${escapeHtml(workout.name)}</h2>
        <p>合計予定時間: <strong>${escapeHtml(formatDuration(totalSec))}</strong></p>
        <ol class="confirm-med-list">
          ${workout.medications
            .map((m) => {
              const stepsText = m.steps
                .filter((s) => Number(s.durationSec) > 0)
                .map((s) => `${escapeHtml(s.label)}（${escapeHtml(formatDuration(s.durationSec))}）`)
                .join(" → ");
              return `<li><strong>${escapeHtml(m.name)}</strong>: ${stepsText || "実行工程なし"}</li>`;
            })
            .join("")}
        </ol>
      </section>

      <section class="card">
        <h2 style="margin-top:0; font-size:1.08rem;">音声ガイド設定</h2>
        <div class="form-group">
          <label class="field-label" for="voice-select">音声</label>
          <select id="voice-select" class="select-input" ${voices.length === 0 ? "disabled" : ""}>
            ${voiceOptionsHtml}
          </select>
        </div>

        <div class="form-group">
          <span class="field-label">読み上げ速度</span>
          <div class="rate-btn-group">${ratesHtml}</div>
        </div>

        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" id="btn-voice-test">🔊 音声テスト</button>
          <span class="muted-text" id="voice-test-status"></span>
        </div>
      </section>

      <div style="margin-top: 16px;">
        <button type="button" class="btn btn-primary" id="btn-start-timer" style="width:100%; padding:12px;">タイマーを開始する</button>
      </div>
    `;

    bindEvents(voices);
  };

  const bindEvents = (voices) => {
    container.querySelector("#btn-back-list")?.addEventListener("click", () => {
      speech.cancel();
      actions.onBack();
    });

    const voiceSelect = container.querySelector("#voice-select");
    voiceSelect?.addEventListener("change", () => {
      const selected = voiceSelect.value;
      currentSettings = { ...currentSettings, voiceName: selected };
      actions.onUpdateVoiceSettings({ voiceName: selected });
    });

    container.querySelectorAll("[data-rate]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rate = Number(btn.dataset.rate);
        currentSettings = { ...currentSettings, rate };
        actions.onUpdateVoiceSettings({ rate });
        renderContent();
      });
    });

    container.querySelector("#btn-voice-test")?.addEventListener("click", () => {
      speech.unlock();
      const firstMed = workout.medications?.[0]?.name || "ヒアルロン酸";
      const sampleText = `${firstMed}、準備、20秒、開始します。`;
      speech.speak(sampleText, { interrupt: true, fallbackTone: "start" });
      const statusEl = container.querySelector("#voice-test-status");
      if (statusEl) {
        statusEl.textContent =
          voices.length > 0 ? `再生中: 「${sampleText}」` : "音声非対応のため効果音を再生しました";
      }
    });

    container.querySelector("#btn-start-timer")?.addEventListener("click", () => {
      // 開始クリックイベント内で音声合成をアンロック
      speech.unlock();
      actions.onStart();
    });
  };

  renderContent();

  // 非同期で音声リストが読み込まれるブラウザーに対応
  const handleVoicesChanged = () => {
    renderContent();
  };
  if (speech.isSpeechSupported && "addEventListener" in window.speechSynthesis) {
    window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
  }

  return () => {
    if (speech.isSpeechSupported && "removeEventListener" in window.speechSynthesis) {
      window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
    }
  };
}
