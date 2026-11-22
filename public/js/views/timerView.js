// SCR-04: タイマー実行画面
import { STEP_TYPES, escapeHtml } from "../models.js";
import {
  WakeLockController,
  buildExecutionQueue,
  createTimerRunner,
  formatClock,
} from "../timerEngine.js";

/** タイマー実行画面の描画と制御 */
export function renderTimerView(container, workout, actions) {
  const queue = buildExecutionQueue(workout);

  if (queue.length === 0) {
    container.innerHTML = `
      <div class="view-header">
        <button type="button" class="btn btn-secondary" id="btn-empty-back">← 戻る</button>
        <h1>タイマー実行</h1>
        <span></span>
      </div>
      <section class="card">
        <p>実行可能な工程（1秒以上）がありません。ワークアウト設定を見直してください。</p>
      </section>
    `;
    container.querySelector("#btn-empty-back")?.addEventListener("click", () => {
      actions.onAbort();
    });
    return () => {};
  }

  container.innerHTML = `
    <div class="view-header">
      <span class="meta-pill" id="timer-med-progress">薬 1 / 1</span>
      <h1>${escapeHtml(workout.name)}</h1>
      <span class="meta-pill" id="timer-wakelock-badge">Wake Lock 確認中</span>
    </div>

    <section class="card timer-card" id="timer-card">
      <div class="timer-med-name" id="timer-med-name"></div>
      <div class="timer-step-label" id="timer-step-label"></div>
      <div class="timer-guide-banner" id="timer-guide-banner" hidden></div>
      <div class="timer-clock" id="timer-clock">00:00</div>
      <div class="progress-track" aria-label="工程進捗">
        <div class="progress-fill" id="timer-progress-fill" style="width: 0%;"></div>
      </div>
      <div class="muted-text" id="timer-step-counter"></div>
      <div class="speech-subtitle" id="timer-speech-subtitle" aria-live="polite"></div>
    </section>

    <div class="timer-controls" id="timer-running-controls">
      <button type="button" class="btn btn-warn" id="btn-pause">⏸ 一時停止</button>
      <button type="button" class="btn btn-secondary" id="btn-skip">⏭ この工程をスキップ</button>
    </div>

    <section class="card pause-panel" id="timer-pause-panel" hidden>
      <h2 style="margin-top:0; font-size:1.05rem;">一時停止中</h2>
      <div class="pause-actions">
        <button type="button" class="btn btn-primary" id="btn-resume">▶ 再開</button>
        <button type="button" class="btn btn-secondary" id="btn-restart">↺ 最初からやり直す</button>
        <button type="button" class="btn btn-danger" id="btn-abort">一覧へ戻る（中断）</button>
      </div>
    </section>
  `;

  const medProgressEl = container.querySelector("#timer-med-progress");
  const wakeLockBadgeEl = container.querySelector("#timer-wakelock-badge");
  const medNameEl = container.querySelector("#timer-med-name");
  const stepLabelEl = container.querySelector("#timer-step-label");
  const guideBannerEl = container.querySelector("#timer-guide-banner");
  const clockEl = container.querySelector("#timer-clock");
  const progressFillEl = container.querySelector("#timer-progress-fill");
  const stepCounterEl = container.querySelector("#timer-step-counter");
  const subtitleEl = container.querySelector("#timer-speech-subtitle");
  const timerCardEl = container.querySelector("#timer-card");
  const runningControlsEl = container.querySelector("#timer-running-controls");
  const pausePanelEl = container.querySelector("#timer-pause-panel");

  const flashCard = () => {
    if (!timerCardEl) return;
    timerCardEl.classList.remove("is-flash");
    void timerCardEl.offsetWidth;
    timerCardEl.classList.add("is-flash");
  };

  actions.bindSubtitle?.((text) => {
    if (subtitleEl) subtitleEl.textContent = `🔊 ${text}`;
  });

  const wakeLock = new WakeLockController((status) => {
    if (!wakeLockBadgeEl) return;
    if (status === "active") {
      wakeLockBadgeEl.textContent = "スリープ抑止 ON";
    } else if (status === "unsupported") {
      wakeLockBadgeEl.textContent = "スリープ抑止 非対応";
    } else {
      wakeLockBadgeEl.textContent = "スリープ抑止 OFF";
    }
  });

  let previousStep = null;

  const updateGuideBanner = (step) => {
    if (!guideBannerEl) return;
    // 準備の直後（直後の瞑想開始時）に点眼実施ガイドを表示
    if (
      step.type === STEP_TYPES.MEDITATION &&
      previousStep &&
      previousStep.medIndex === step.medIndex &&
      previousStep.type === STEP_TYPES.PREPARE
    ) {
      guideBannerEl.hidden = false;
      guideBannerEl.textContent = `💧 ${step.medName} を点眼して目を閉じてください`;
    } else {
      guideBannerEl.hidden = true;
      guideBannerEl.textContent = "";
    }
  };

  const runner = createTimerRunner(queue, {
    onStepStart: (step, index, totalSteps) => {
      const prev = previousStep;
      updateGuideBanner(step);
      previousStep = step;
      flashCard();
      if (medProgressEl) medProgressEl.textContent = `薬 ${step.medIndex + 1} / ${step.totalMeds}`;
      if (medNameEl) medNameEl.textContent = step.medName;
      if (stepLabelEl) stepLabelEl.textContent = step.label;
      if (stepCounterEl) stepCounterEl.textContent = `全体進捗: ${index + 1} / ${totalSteps} 工程`;
      actions.onStepStart?.(step, prev);
    },
    onTick: ({ remainingSec, progress, isPaused }) => {
      if (clockEl) clockEl.textContent = formatClock(remainingSec);
      if (progressFillEl) progressFillEl.style.width = `${Math.round(progress * 100)}%`;
      if (runningControlsEl) runningControlsEl.hidden = isPaused;
      if (pausePanelEl) pausePanelEl.hidden = !isPaused;
    },
    onCountdown: (sec, step) => {
      flashCard();
      actions.onCountdown?.(sec, step);
    },
    onStepComplete: (step, skippedByBackground) => {
      actions.onStepComplete?.(step, skippedByBackground);
    },
    onPause: () => {
      actions.onPause?.();
    },
    onSkip: (step) => {
      actions.onSkip?.(step);
    },
    onAllComplete: (resultMeta) => {
      cleanup();
      actions.onComplete({
        ...resultMeta,
        workoutName: workout.name,
        calendarStatus: "unsaved",
      });
    },
  });

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      runner.syncNow();
      wakeLock.acquire();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  const cleanup = () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    runner.destroy();
    wakeLock.release();
  };

  container.querySelector("#btn-pause")?.addEventListener("click", () => {
    runner.pause();
    wakeLock.release();
  });

  container.querySelector("#btn-resume")?.addEventListener("click", () => {
    wakeLock.acquire();
    runner.resume();
  });

  container.querySelector("#btn-skip")?.addEventListener("click", () => {
    runner.skip();
  });

  container.querySelector("#btn-restart")?.addEventListener("click", () => {
    previousStep = null;
    wakeLock.acquire();
    runner.restart();
  });

  container.querySelector("#btn-abort")?.addEventListener("click", () => {
    if (!window.confirm("タイマーを中断して一覧へ戻りますか？")) return;
    cleanup();
    actions.onAbort();
  });

  wakeLock.acquire();
  runner.start();

  return cleanup;
}
