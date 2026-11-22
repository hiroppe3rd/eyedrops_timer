// localStorage 永続化・スキーマバージョン管理
export const SCHEMA_VERSION = 2;
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

/** スキーマバージョンに応じたマイグレーション */
function migrateData(data) {
  if (!data || typeof data !== "object") {
    return createInitialData();
  }
  const defaults = createInitialData();
  // 旧スキーマ(workouts / workoutName)からの移行に対応
  const routines = Array.isArray(data.routines)
    ? data.routines
    : Array.isArray(data.workouts)
      ? data.workouts
      : defaults.routines;
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
