// localStorage 永続化・スキーマバージョン管理
export const SCHEMA_VERSION = 3;
const STORAGE_KEY = "eyedrops_timer_data";

/** 初期データ構造の生成 */
function createInitialData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    routines: [],
    voiceSettings: {
      voiceName: "Google 日本語",
      rate: 1.0,
    },
    pendingResults: [],
  };
}

/** 保存データの読み込みと必要に応じた移行 */
export function loadAppData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialData();
    }
    const parsed = JSON.parse(raw);
    return migrateData(parsed);
  } catch {
    // 破損時は初期データを返却
    return createInitialData();
  }
}

/** データの保存 */
export function saveAppData(data) {
  const payload = {
    ...data,
    schemaVersion: SCHEMA_VERSION,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** 旧スキーマ(v1/v2)の「閉眼＋追加待機」をv3の「点眼間隔」基準へ変換 */
function migrateRoutinesToIntervalModel(routines) {
  return routines.map((routine) => {
    if (!routine || !Array.isArray(routine.medications)) return routine;
    return {
      ...routine,
      medications: routine.medications.map((med) => {
        if (!med || !Array.isArray(med.steps)) return med;
        const meditationSec =
          Number(med.steps.find((s) => s.type === "meditation")?.durationSec) || 0;
        const steps = med.steps.map((step) => {
          if (step.type !== "wait") return step;
          const waitSec = Number(step.durationSec) || 0;
          const label =
            step.label === "次の点眼までの待機" ? "次の点眼までの間隔" : step.label;
          return {
            ...step,
            label,
            // 従来の待機時間に閉眼時間を加算して点眼間隔を維持
            durationSec: waitSec > 0 ? meditationSec + waitSec : 0,
          };
        });
        return { ...med, steps };
      }),
    };
  });
}

/** スキーマバージョンに応じたマイグレーション */
function migrateData(data) {
  if (!data || typeof data !== "object") {
    return createInitialData();
  }
  const defaults = createInitialData();
  const prevVersion = Number(data.schemaVersion) || 1;
  // 旧スキーマ(workouts / workoutName)からの移行に対応
  const rawRoutines = Array.isArray(data.routines)
    ? data.routines
    : Array.isArray(data.workouts)
      ? data.workouts
      : defaults.routines;
  const routines = prevVersion < 3 ? migrateRoutinesToIntervalModel(rawRoutines) : rawRoutines;
  const pendingResults = Array.isArray(data.pendingResults)
    ? data.pendingResults.map((item) => {
        if (!item || typeof item !== "object") return item;
        if (item.routineName !== undefined) return item;
        const { workoutName, ...rest } = item;
        return { ...rest, routineName: workoutName ?? "" };
      })
    : defaults.pendingResults;

  return {
    schemaVersion: SCHEMA_VERSION,
    routines,
    voiceSettings: {
      ...defaults.voiceSettings,
      ...(data.voiceSettings || {}),
    },
    pendingResults,
  };
}
