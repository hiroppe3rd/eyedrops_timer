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
  buildStepCompleteSpeech,
  buildStepStartSpeech,
} from "./speech.js";
import { renderRoutineListView } from "./views/routineListView.js";
import { renderRoutineEditView } from "./views/routineEditView.js";
import { renderConfirmView } from "./views/confirmView.js";
import { renderTimerView } from "./views/timerView.js";
import { renderCompleteView } from "./views/completeView.js";

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
};

/** 画面描画 */
function render() {
  if (!appContainer) return;
  if (typeof appState.cleanupCurrentView === "function") {
    appState.cleanupCurrentView();
    appState.cleanupCurrentView = null;
  }

  if (appState.currentScreen === "SCR-01") {
    renderRoutineListView(appContainer, appState, {
      onCreate: () => {
        appState.editingRoutine = createDefaultRoutine();
        appState.editingIsNew = true;
        appState.currentScreen = "SCR-02";
        render();
      },
      onEdit: (id) => {
        const target = appState.data.routines.find((r) => r.id === id);
        if (!target) return;
        appState.editingRoutine = structuredClone(target);
        appState.editingIsNew = false;
        appState.currentScreen = "SCR-02";
        render();
      },
      onDelete: (id) => {
        const target = appState.data.routines.find((r) => r.id === id);
        if (!target) return;
        if (!window.confirm(`「${target.name}」を削除しますか？`)) return;
        appState.data.routines = appState.data.routines
          .filter((r) => r.id !== id)
          .map((r, idx) => ({ ...r, order: idx }));
        saveAppData(appState.data);
        render();
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
        appState.currentScreen = "SCR-03";
        render();
      },
      onRetryPending: (pendingResult) => {
        appState.latestResult = pendingResult;
        appState.currentScreen = "SCR-05";
        render();
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
    renderRoutineEditView(appContainer, appState.editingRoutine, appState.editingIsNew, {
      existingRoutines: appState.data.routines,
      onCancel: () => {
        appState.editingRoutine = null;
        appState.currentScreen = "SCR-01";
        render();
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
        appState.currentScreen = "SCR-01";
        render();
      },
    });
    return;
  }

  if (appState.currentScreen === "SCR-03") {
    const routine = appState.data.routines.find((r) => r.id === appState.selectedRoutineId);
    if (!routine) {
      appState.currentScreen = "SCR-01";
      render();
      return;
    }
    appState.cleanupCurrentView = renderConfirmView(
      appContainer,
      routine,
      appState.data.voiceSettings,
      speech,
      {
        onBack: () => {
          appState.currentScreen = "SCR-01";
          render();
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
          appState.currentScreen = "SCR-04";
          render();
        },
      }
    );
    return;
  }

  if (appState.currentScreen === "SCR-04") {
    const routine = appState.data.routines.find((r) => r.id === appState.selectedRoutineId);
    if (!routine) {
      appState.currentScreen = "SCR-01";
      render();
      return;
    }
    const timerCleanup = renderTimerView(appContainer, routine, {
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
      onStepComplete: (step, skippedByBackground) => {
        if (skippedByBackground) return;
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
        appState.currentScreen = "SCR-01";
        render();
      },
      onComplete: (result) => {
        speech.onSubtitle = null;
        // 完了履歴を未保存状態で一時保存
        appState.data.pendingResults.unshift(result);
        saveAppData(appState.data);
        appState.latestResult = result;
        appState.currentScreen = "SCR-05";
        render();
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
    renderCompleteView(appContainer, result, {
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
        appState.latestResult = null;
        appState.currentScreen = "SCR-01";
        render();
      },
    });
  }
}

// 初期描画
document.addEventListener("DOMContentLoaded", () => {
  render();
});
