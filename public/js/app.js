// 点眼タイマー SPA エントリーポイント
import {
  createDefaultRoutine,
  escapeHtml,
  formatDateTime,
  removePendingResult,
} from "./models.js";
import { loadAppData, saveAppData } from "./storage.js";
import {
  SpeechGuideController,
  buildRoutineCompleteSpeech,
  buildStepCompleteSpeech,
  buildStepStartSpeech,
} from "./speech.js";
import { renderRoutineListView } from "./views/routineListView.js";
import { renderRoutineEditView } from "./views/routineEditView.js";
import { renderConfirmView } from "./views/confirmView.js";
import { renderTimerView } from "./views/timerView.js";
import { renderCompleteView } from "./views/completeView.js";
import { initPwaInstall } from "./pwaInstall.js";
import { createNavigationGuard } from "./navigationGuard.js";

const appContainer = document.getElementById("app");
const initialData = loadAppData();
const speech = new SpeechGuideController(initialData.voiceSettings);

const appState = {
  data: initialData,
  currentScreen: "SCR-01",
  editingRoutine: null,
  editingIsNew: false,
  selectedRoutineId: null,
  latestResult: null,
  pendingExpanded: false,
  cleanupCurrentView: null,
  getGuardState: null,
};

/** 画面遷移（履歴スタック連携） */
const navigationGuard = createNavigationGuard({
  getGuardState: () => {
    const state = appState.getGuardState?.();
    if (!state?.shouldConfirm) return { shouldConfirm: false, currentScreen: appState.currentScreen };
    return {
      ...state,
      currentScreen: appState.currentScreen,
    };
  },
  onNavigate: (screen, state) => {
    if (appState.currentScreen === "SCR-04") {
      speech.cancel();
    }
    if (screen === "SCR-02" && !appState.editingRoutine) {
      appState.currentScreen = "SCR-01";
      navigationGuard.replace("SCR-01");
      render();
      return;
    }
    if ((screen === "SCR-03" || screen === "SCR-04") && state?.routineId) {
      appState.selectedRoutineId = state.routineId;
    }
    appState.currentScreen = screen;
    render();
  },
});

function navigateTo(screen, { historyMode = "push", meta = {} } = {}) {
  appState.currentScreen = screen;
  if (historyMode === "push") {
    navigationGuard.push(screen, meta);
  } else if (historyMode === "replace") {
    navigationGuard.replace(screen, meta);
  }
  render();
}

/** ルーティン削除の共通処理 */
function deleteRoutineById(id) {
  const target = appState.data.routines.find((r) => r.id === id);
  if (!target) return false;
  if (!window.confirm(`「${target.name}」を削除しますか？`)) return false;
  appState.data.routines = appState.data.routines
    .filter((r) => r.id !== id)
    .map((r, idx) => ({ ...r, order: idx }));
  saveAppData(appState.data);
  return true;
}

/** 画面描画 */
function render() {
  if (!appContainer) return;
  appState.getGuardState = null;
  if (typeof appState.cleanupCurrentView === "function") {
    appState.cleanupCurrentView();
    appState.cleanupCurrentView = null;
  }

  if (appState.currentScreen === "SCR-01") {
    renderRoutineListView(appContainer, appState, {
      onCreate: () => {
        appState.editingRoutine = createDefaultRoutine();
        appState.editingIsNew = true;
        navigateTo("SCR-02");
      },
      onEdit: (id) => {
        const target = appState.data.routines.find((r) => r.id === id);
        if (!target) return;
        appState.editingRoutine = structuredClone(target);
        appState.editingIsNew = false;
        navigateTo("SCR-02");
      },
      onDelete: (id) => {
        if (deleteRoutineById(id)) render();
      },
      onReorder: (orderedIds) => {
        const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
        appState.data.routines = appState.data.routines
          .map((r) => ({ ...r, order: orderMap.get(r.id) ?? r.order }))
          .sort((a, b) => a.order - b.order);
        saveAppData(appState.data);
        render();
      },
      onStart: (id) => {
        appState.selectedRoutineId = id;
        navigateTo("SCR-03", { meta: { routineId: id } });
      },
      onRetryPending: (pendingResult) => {
        appState.latestResult = pendingResult;
        navigateTo("SCR-05");
      },
      onTogglePendingDetails: () => {
        appState.pendingExpanded = !appState.pendingExpanded;
        render();
      },
      onDeletePending: (pendingResult) => {
        if (!pendingResult) return;
        const label = formatDateTime(pendingResult.completedAt) || "日時不明";
        if (!window.confirm(`「${pendingResult.routineName}」（${label}）の未保存履歴を削除しますか？`)) {
          return;
        }
        appState.data.pendingResults = removePendingResult(
          appState.data.pendingResults,
          pendingResult.executionId
        );
        saveAppData(appState.data);
        render();
      },
    });
    return;
  }

  if (appState.currentScreen === "SCR-02") {
    if (!appState.editingRoutine) {
      navigateTo("SCR-01", { historyMode: "replace" });
      return;
    }
    let isEditDirty = () => false;
    appState.getGuardState = () => ({
      shouldConfirm: isEditDirty(),
      message: "編集中の内容が保存されていません。破棄して移動しますか？",
    });
    renderRoutineEditView(appContainer, appState.editingRoutine, appState.editingIsNew, {
      existingRoutines: appState.data.routines,
      bindDirtyChecker: (fn) => {
        isEditDirty = fn;
      },
      onCancel: () => {
        if (isEditDirty() && !window.confirm("編集中の内容が保存されていません。破棄して一覧へ戻りますか？")) {
          return;
        }
        appState.editingRoutine = null;
        navigateTo("SCR-01", { historyMode: "replace" });
      },
      onDelete: (id) => {
        if (deleteRoutineById(id)) {
          appState.editingRoutine = null;
          navigateTo("SCR-01", { historyMode: "replace" });
        }
      },
      onSave: (savedRoutine) => {
        const now = new Date().toISOString();
        if (appState.editingIsNew) {
          const nextOrder = appState.data.routines.length;
          appState.data.routines.push({
            ...savedRoutine,
            order: nextOrder,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          appState.data.routines = appState.data.routines.map((r) =>
            r.id === savedRoutine.id ? { ...savedRoutine, updatedAt: now } : r
          );
        }
        saveAppData(appState.data);
        appState.editingRoutine = null;
        navigateTo("SCR-01", { historyMode: "replace" });
      },
    });
    return;
  }

  if (appState.currentScreen === "SCR-03") {
    const routine = appState.data.routines.find((r) => r.id === appState.selectedRoutineId);
    if (!routine) {
      navigateTo("SCR-01", { historyMode: "replace" });
      return;
    }
    appState.cleanupCurrentView = renderConfirmView(
      appContainer,
      routine,
      appState.data.voiceSettings,
      speech,
      {
        onBack: () => {
          navigateTo("SCR-01", { historyMode: "replace" });
        },
        onUpdateVoiceSettings: (patch) => {
          appState.data.voiceSettings = {
            ...appState.data.voiceSettings,
            ...patch,
          };
          speech.updateSettings(appState.data.voiceSettings);
          saveAppData(appState.data);
        },
        onStart: () => {
          navigateTo("SCR-04", { meta: { routineId: appState.selectedRoutineId } });
        },
      }
    );
    return;
  }

  if (appState.currentScreen === "SCR-04") {
    const routine = appState.data.routines.find((r) => r.id === appState.selectedRoutineId);
    if (!routine) {
      navigateTo("SCR-01", { historyMode: "replace" });
      return;
    }
    let isTimerActive = () => false;
    appState.getGuardState = () => ({
      shouldConfirm: isTimerActive(),
      message: "タイマーを実行中です。中断して移動しますか？",
      meta: { routineId: appState.selectedRoutineId },
    });
    const timerCleanup = renderTimerView(appContainer, routine, {
      bindActiveChecker: (fn) => {
        isTimerActive = fn;
      },
      bindSubtitle: (fn) => {
        speech.onSubtitle = fn;
      },
      onStepStart: (step, prevStep) => {
        // 5秒未満の短い工程は開始読み上げを省きカウントダウンを優先
        if (step.durationSec < 5) {
          speech.onSubtitle?.(`${step.medName} ${step.label}（${step.durationSec}秒）`);
          return;
        }
        speech.speak(buildStepStartSpeech(step, prevStep), {
          interrupt: false,
          fallbackTone: "start",
        });
      },
      onCountdown: (sec) => {
        // 前の発話が再生中の場合はキャンセルで割り込む
        speech.speak(String(sec), { interrupt: true, fallbackTone: "tick" });
      },
      onStepComplete: (step, skippedByBackground, isLastStep) => {
        if (skippedByBackground || isLastStep) return;
        speech.speak(buildStepCompleteSpeech(step), {
          interrupt: false,
          fallbackTone: "complete",
        });
      },
      onPause: () => {
        speech.cancel();
      },
      onSkip: () => {
        speech.cancel();
      },
      onAbort: () => {
        speech.cancel();
        speech.onSubtitle = null;
        navigateTo("SCR-01", { historyMode: "replace" });
      },
      onComplete: (result) => {
        speech.onSubtitle = null;
        speech.speak(buildRoutineCompleteSpeech(routine), {
          interrupt: false,
          fallbackTone: "routineComplete",
        });
        // 完了履歴を未保存状態で一時保存
        appState.data.pendingResults.unshift(result);
        saveAppData(appState.data);
        appState.latestResult = result;
        navigateTo("SCR-05", { historyMode: "replace" });
      },
    });
    appState.cleanupCurrentView = () => {
      speech.onSubtitle = null;
      timerCleanup();
    };
    return;
  }

  if (appState.currentScreen === "SCR-05") {
    const result = appState.latestResult || appState.data.pendingResults[0];
    let isCalendarSaving = () => false;
    appState.getGuardState = () => ({
      shouldConfirm: isCalendarSaving(),
      message: "Googleカレンダーへの記録処理中です。移動しますか？",
    });
    renderCompleteView(appContainer, result, {
      bindSavingChecker: (fn) => {
        isCalendarSaving = fn;
      },
      onSaved: (executionId, htmlLink) => {
        if (appState.latestResult && appState.latestResult.executionId === executionId) {
          appState.latestResult = {
            ...appState.latestResult,
            calendarStatus: "saved",
            htmlLink,
          };
        }
        // 保存完了した履歴は未保存リストから除去
        appState.data.pendingResults = removePendingResult(appState.data.pendingResults, executionId);
        saveAppData(appState.data);
      },
      onBackHome: () => {
        if (isCalendarSaving() && !window.confirm("Googleカレンダーへの記録処理中です。一覧へ戻りますか？")) {
          return;
        }
        appState.latestResult = null;
        navigateTo("SCR-01", { historyMode: "replace" });
      },
    });
  }
}

// 初期描画
document.addEventListener("DOMContentLoaded", () => {
  initPwaInstall();
  navigationGuard.init("SCR-01");
  render();
});
