// localStorage 永続化・スキーマバージョン管理
export const SCHEMA_VERSION = 1;
const STORAGE_KEY = "eyedrops_timer_data";

/** 初期データ構造の生成 */
function createInitialData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    workouts: [],
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
  return {
    schemaVersion: SCHEMA_VERSION,
    workouts: Array.isArray(data.workouts) ? data.workouts : defaults.workouts,
    voiceSettings: {
      ...defaults.voiceSettings,
      ...(data.voiceSettings || {}),
    },
    pendingResults: Array.isArray(data.pendingResults)
      ? data.pendingResults
      : defaults.pendingResults,
  };
}
