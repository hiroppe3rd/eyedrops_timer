// 点眼タイマー SPA エントリーポイント
import {
  createDefaultWorkout,
  escapeHtml,
} from "./models.js";
import { loadAppData, saveAppData } from "./storage.js";
import {
  SpeechGuideController,
  buildStepCompleteSpeech,
  buildStepStartSpeech,
} from "./speech.js";
import { renderWorkoutListView } from "./views/workoutListView.js";
import { renderWorkoutEditView } from "./views/workoutEditView.js";
import { renderConfirmView } from "./views/confirmView.js";
import { renderTimerView } from "./views/timerView.js";

const appContainer = document.getElementById("app");
const initialData = loadAppData();
const speech = new SpeechGuideController(initialData.voiceSettings);

const appState = {
  data: initialData,
  currentScreen: "SCR-01",
  editingWorkout: null,
  editingIsNew: false,
  selectedWorkoutId: null,
  latestResult: null,
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
    renderWorkoutListView(appContainer, appState, {
      onCreate: () => {
        appState.editingWorkout = createDefaultWorkout();
        appState.editingIsNew = true;
        appState.currentScreen = "SCR-02";
        render();
      },
      onEdit: (id) => {
        const target = appState.data.workouts.find((w) => w.id === id);
        if (!target) return;
        appState.editingWorkout = structuredClone(target);
        appState.editingIsNew = false;
        appState.currentScreen = "SCR-02";
        render();
      },
      onDelete: (id) => {
        const target = appState.data.workouts.find((w) => w.id === id);
        if (!target) return;
        if (!window.confirm(`「${target.name}」を削除しますか？`)) return;
        appState.data.workouts = appState.data.workouts
          .filter((w) => w.id !== id)
          .map((w, idx) => ({ ...w, order: idx }));
        saveAppData(appState.data);
        render();
      },
      onReorder: (orderedIds) => {
        const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
        appState.data.workouts = appState.data.workouts
          .map((w) => ({ ...w, order: orderMap.get(w.id) ?? w.order }))
          .sort((a, b) => a.order - b.order);
        saveAppData(appState.data);
        render();
      },
      onStart: (id) => {
        appState.selectedWorkoutId = id;
        appState.currentScreen = "SCR-03";
        render();
      },
      onRetryPending: () => {
        // フェーズ5でSCR-05を実装予定
        window.alert("カレンダー保存画面（SCR-05）はフェーズ5で実装予定です。");
      },
    });
    return;
  }

  if (appState.currentScreen === "SCR-02") {
    renderWorkoutEditView(appContainer, appState.editingWorkout, appState.editingIsNew, {
      onCancel: () => {
        appState.editingWorkout = null;
        appState.currentScreen = "SCR-01";
        render();
      },
      onSave: (savedWorkout) => {
        const now = new Date().toISOString();
        if (appState.editingIsNew) {
          const nextOrder = appState.data.workouts.length;
          appState.data.workouts.push({
            ...savedWorkout,
            order: nextOrder,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          appState.data.workouts = appState.data.workouts.map((w) =>
            w.id === savedWorkout.id ? { ...savedWorkout, updatedAt: now } : w
          );
        }
        saveAppData(appState.data);
        appState.editingWorkout = null;
        appState.currentScreen = "SCR-01";
        render();
      },
    });
    return;
  }

  if (appState.currentScreen === "SCR-03") {
    const workout = appState.data.workouts.find((w) => w.id === appState.selectedWorkoutId);
    if (!workout) {
      appState.currentScreen = "SCR-01";
      render();
      return;
    }
    appState.cleanupCurrentView = renderConfirmView(
      appContainer,
      workout,
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
    const workout = appState.data.workouts.find((w) => w.id === appState.selectedWorkoutId);
    if (!workout) {
      appState.currentScreen = "SCR-01";
      render();
      return;
    }
    const timerCleanup = renderTimerView(appContainer, workout, {
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
    appContainer.innerHTML = `
      <div class="view-header">
        <span></span>
        <h1>ワークアウト完了</h1>
        <button type="button" class="btn btn-secondary" id="btn-done-home">一覧へ</button>
      </div>
      <section class="card">
        <p style="color:var(--accent); font-weight:700; margin-top:0;">✓ すべての工程が完了しました</p>
        ${
          result
            ? `<p>ワークアウト: <strong>${escapeHtml(result.workoutName)}</strong></p>
               <p class="muted-text">開始: ${escapeHtml(new Date(result.startedAt).toLocaleString("ja-JP"))}<br>
               完了: ${escapeHtml(new Date(result.completedAt).toLocaleString("ja-JP"))}</p>`
            : ""
        }
        <p class="muted-text">※ Googleカレンダーへの保存機能はフェーズ5で実装予定です（完了履歴はブラウザーに一時保存済みです）。</p>
      </section>
    `;
    appContainer.querySelector("#btn-done-home")?.addEventListener("click", () => {
      appState.currentScreen = "SCR-01";
      render();
    });
  }
}

// 初期描画
document.addEventListener("DOMContentLoaded", () => {
  render();
});
