// タイマー実行エンジン（時刻差分計算・Wake Lock管理）
import { STEP_TYPES, createId, getStepLabel } from "./models.js";

/** ルーティンから実行工程キューを生成（0秒工程は除外） */
export function buildExecutionQueue(routine) {
  if (!routine || !Array.isArray(routine.medications)) return [];
  const queue = [];
  const totalMeds = routine.medications.length;

  routine.medications.forEach((med, medIdx) => {
    const isLastMed = medIdx === totalMeds - 1;
    let isFirstStepOfMed = true;
    const steps = Array.isArray(med.steps) ? med.steps : [];
    const meditationSec = Number(steps.find((s) => s.type === STEP_TYPES.MEDITATION)?.durationSec) || 0;

    steps.forEach((step) => {
      if (isLastMed && step.type === STEP_TYPES.WAIT) return;
      const rawDurationSec = Number(step.durationSec) || 0;
      if (rawDurationSec <= 0) return;

      // 待機工程は「次の点眼までの間隔」として保持し、予定残り待機時間を算出
      const isWait = step.type === STEP_TYPES.WAIT;
      const durationSec = isWait ? Math.max(0, rawDurationSec - meditationSec) : rawDurationSec;

      queue.push({
        medIndex: medIdx,
        totalMeds,
        medName: med.name,
        medNote: typeof med.note === "string" ? med.note : "",
        isFirstStepOfMed,
        type: step.type,
        label: getStepLabel(step.type),
        durationSec,
        ...(isWait ? { intervalSec: rawDurationSec } : {}),
      });
      isFirstStepOfMed = false;
    });
  });

  return queue;
}

/** 秒数を MM:SS 形式に整形 */
export function formatClock(seconds) {
  const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Wake Lock 管理クラス */
export class WakeLockController {
  constructor(onStatusChange) {
    this.sentinel = null;
    this.onStatusChange = onStatusChange;
  }

  get isSupported() {
    return typeof navigator !== "undefined" && "wakeLock" in navigator;
  }

  async acquire() {
    if (!this.isSupported) {
      this.onStatusChange?.("unsupported");
      return false;
    }
    try {
      this.sentinel = await navigator.wakeLock.request("screen");
      this.sentinel.addEventListener("release", () => {
        this.sentinel = null;
        this.onStatusChange?.("released");
      });
      this.onStatusChange?.("active");
      return true;
    } catch {
      this.sentinel = null;
      this.onStatusChange?.("unavailable");
      return false;
    }
  }

  async release() {
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        // 既に解放済みの場合は無視
      }
      this.sentinel = null;
    }
  }
}

/** 時刻差分ベースのタイマー制御 */
export function createTimerRunner(queue, callbacks) {
  const startedAtIso = new Date().toISOString();
  let currentIndex = 0;
  let currentStep = null;
  let stepEndAtMs = 0;
  let pausedRemainingMs = 0;
  let isPaused = false;
  let isFinished = false;
  let timerId = null;
  let lastNotifiedSec = null;
  // 薬ごとの実際の閉眼経過時間（ミリ秒）を記録し、点眼間隔を維持する
  const actualMeditationMsByMed = new Map();

  const getCurrentStep = () => currentStep;

  const startStep = (index, carryOverMs = 0) => {
    if (index >= queue.length) {
      currentStep = null;
      finishAll();
      return;
    }
    currentIndex = index;
    const rawStep = queue[currentIndex];
    let targetMs = rawStep.durationSec * 1000;
    let effectiveStep = rawStep;

    if (rawStep.type === STEP_TYPES.WAIT && Number.isFinite(rawStep.intervalSec)) {
      const actualMedMs = actualMeditationMsByMed.get(rawStep.medIndex) || 0;
      targetMs = Math.max(0, rawStep.intervalSec * 1000 - actualMedMs);
      effectiveStep = {
        ...rawStep,
        durationSec: Math.ceil(targetMs / 1000),
      };
    }

    currentStep = effectiveStep;
    const durationMs = targetMs - carryOverMs;

    if (durationMs <= 0) {
      // 閉眼で既に間隔を満たした場合（targetMs === 0）は完了通知を出さずに次へ
      if (targetMs > 0) {
        if (effectiveStep.type === STEP_TYPES.MEDITATION) {
          actualMeditationMsByMed.set(effectiveStep.medIndex, targetMs);
        }
        callbacks.onStepComplete?.(effectiveStep, true, index === queue.length - 1);
      }
      startStep(index + 1, Math.abs(durationMs));
      return;
    }

    stepEndAtMs = Date.now() + durationMs;
    // 5秒未満の短い工程はその秒数からカウントダウンを発火させる
    lastNotifiedSec = effectiveStep.durationSec < 5 ? null : Math.ceil(durationMs / 1000);
    isPaused = false;
    callbacks.onStepStart?.(effectiveStep, currentIndex, queue.length);
    emitTick(durationMs);
  };

  const emitTick = (remainingMs) => {
    const step = getCurrentStep();
    if (!step) return;
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    const totalMs = step.durationSec * 1000;
    const progress = totalMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / totalMs)) : 1;

    callbacks.onTick?.({
      step,
      index: currentIndex,
      totalSteps: queue.length,
      remainingSec,
      progress,
      isPaused,
    });

    if (remainingSec !== lastNotifiedSec) {
      lastNotifiedSec = remainingSec;
      if (remainingSec >= 1 && remainingSec <= 5) {
        callbacks.onCountdown?.(remainingSec, step);
      }
    }
  };

  const tick = () => {
    if (isPaused || isFinished) return;
    const remainingMs = stepEndAtMs - Date.now();
    if (remainingMs <= 0) {
      const completedStep = getCurrentStep();
      if (completedStep?.type === STEP_TYPES.MEDITATION) {
        actualMeditationMsByMed.set(completedStep.medIndex, completedStep.durationSec * 1000);
      }
      callbacks.onStepComplete?.(completedStep, false, currentIndex === queue.length - 1);
      startStep(currentIndex + 1, Math.abs(remainingMs));
      return;
    }
    emitTick(remainingMs);
  };

  const finishAll = () => {
    if (isFinished) return;
    isFinished = true;
    stopLoop();
    callbacks.onAllComplete?.({
      executionId: createId("exec"),
      startedAt: startedAtIso,
      completedAt: new Date().toISOString(),
    });
  };

  const startLoop = () => {
    stopLoop();
    timerId = window.setInterval(tick, 200);
  };

  const stopLoop = () => {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  };

  return {
    start() {
      if (queue.length === 0) return;
      startStep(0, 0);
      startLoop();
    },
    pause() {
      if (isPaused || isFinished) return;
      pausedRemainingMs = Math.max(0, stepEndAtMs - Date.now());
      isPaused = true;
      stopLoop();
      callbacks.onPause?.();
      emitTick(pausedRemainingMs);
    },
    resume() {
      if (!isPaused || isFinished) return;
      isPaused = false;
      stepEndAtMs = Date.now() + pausedRemainingMs;
      callbacks.onResume?.();
      startLoop();
      tick();
    },
    skip() {
      if (isFinished) return;
      const skippedStep = getCurrentStep();
      const remainingMs = isPaused ? pausedRemainingMs : Math.max(0, stepEndAtMs - Date.now());
      if (skippedStep?.type === STEP_TYPES.MEDITATION) {
        const elapsedMs = Math.max(0, skippedStep.durationSec * 1000 - remainingMs);
        actualMeditationMsByMed.set(skippedStep.medIndex, elapsedMs);
      }
      isPaused = false;
      callbacks.onSkip?.(skippedStep);
      startStep(currentIndex + 1, 0);
      if (!isFinished) {
        startLoop();
      }
    },
    restart() {
      isFinished = false;
      isPaused = false;
      actualMeditationMsByMed.clear();
      startStep(0, 0);
      startLoop();
    },
    syncNow() {
      // タブ復帰時などの即時再同期
      tick();
    },
    destroy() {
      isFinished = true;
      stopLoop();
    },
  };
}
