// データモデル・時間計算・バリデーション定義

export const STEP_TYPES = {
  PREPARE: "prepare",
  MEDITATION: "meditation",
  WAIT: "wait",
};

export const DURATION_TEMPLATES = [
  { label: "5秒", seconds: 5 },
  { label: "10秒", seconds: 10 },
  { label: "15秒", seconds: 15 },
  { label: "30秒", seconds: 30 },
  { label: "1分", seconds: 60 },
  { label: "1.5分", seconds: 90 },
  { label: "2分", seconds: 120 },
  { label: "3分", seconds: 180 },
  { label: "4分", seconds: 240 },
  { label: "5分", seconds: 300 },
  { label: "10分", seconds: 600 },
];

/** 一意な識別子を生成 */
export function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 新規点眼薬の初期データを生成 */
export function createDefaultMedication(isLast = false) {
  const steps = [
    { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 15 },
    { type: STEP_TYPES.MEDITATION, label: "直後の瞑想", durationSec: 60 },
  ];
  if (!isLast) {
    steps.push({ type: STEP_TYPES.WAIT, label: "次の点眼までの待機", durationSec: 300 });
  }
  return {
    id: createId("med"),
    name: "",
    steps,
  };
}

/** 新規ワークアウトの初期データを生成 */
export function createDefaultWorkout() {
  return {
    id: createId("wo"),
    name: "",
    order: 0,
    createdAt: null,
    updatedAt: null,
    medications: [createDefaultMedication(true)],
  };
}

/** 秒数を表示用テキストへ変換 */
export function formatDuration(seconds) {
  const sec = Number(seconds);
  if (!Number.isFinite(sec) || sec < 0) return "未設定";
  if (sec === 0) return "0秒（省略）";
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  if (mins === 0) return `${rem}秒`;
  if (rem === 0) return `${mins}分`;
  return `${mins}分${rem}秒`;
}

/** ワークアウトの合計予定秒数を算出 */
export function calcWorkoutTotalSeconds(workout) {
  if (!workout || !Array.isArray(workout.medications)) return 0;
  return workout.medications.reduce((total, med, idx) => {
    const isLast = idx === workout.medications.length - 1;
    const medSec = (med.steps || []).reduce((sum, step) => {
      // 最後の薬の待機工程は合算しない
      if (isLast && step.type === STEP_TYPES.WAIT) return sum;
      return sum + (Number(step.durationSec) || 0);
    }, 0);
    return total + medSec;
  }, 0);
}

/** 最後の点眼薬に待機工程を含めないよう正規化 */
export function normalizeWorkoutSteps(medications) {
  const lastIndex = medications.length - 1;
  return medications.map((med, idx) => {
    const isLast = idx === lastIndex;
    const prepare = med.steps.find((s) => s.type === STEP_TYPES.PREPARE) || {
      type: STEP_TYPES.PREPARE,
      label: "準備",
      durationSec: 15,
    };
    const meditation = med.steps.find((s) => s.type === STEP_TYPES.MEDITATION) || {
      type: STEP_TYPES.MEDITATION,
      label: "直後の瞑想",
      durationSec: 60,
    };
    const steps = [{ ...prepare }, { ...meditation }];
    if (!isLast) {
      const wait = med.steps.find((s) => s.type === STEP_TYPES.WAIT) || {
        type: STEP_TYPES.WAIT,
        label: "次の点眼までの待機",
        durationSec: 300,
      };
      steps.push({ ...wait });
    }
    return {
      ...med,
      steps,
    };
  });
}

/** 数値と単位から秒数へ変換（不正時は null） */
export function parseDurationInput(rawValue, unit) {
  if (rawValue === "" || rawValue === null || rawValue === undefined) {
    return null;
  }
  const num = Number(rawValue);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  const rawSeconds = unit === "min" ? num * 60 : num;
  // 浮動小数誤差を丸めて整数判定
  const rounded = Math.round(rawSeconds * 1000) / 1000;
  if (!Number.isInteger(rounded)) {
    return null;
  }
  return rounded;
}

/** ワークアウト全体の入力検証 */
export function validateWorkout(workout) {
  const errors = [];
  if (!workout.name || !workout.name.trim()) {
    errors.push("ワークアウト名を入力してください。");
  }
  if (!Array.isArray(workout.medications) || workout.medications.length === 0) {
    errors.push("点眼薬を1つ以上登録してください。");
    return errors;
  }

  const lastIndex = workout.medications.length - 1;
  workout.medications.forEach((med, idx) => {
    const medNum = idx + 1;
    if (!med.name || !med.name.trim()) {
      errors.push(`薬${medNum}の薬名を入力してください。`);
    }
    const isLast = idx === lastIndex;
    (med.steps || []).forEach((step) => {
      if (isLast && step.type === STEP_TYPES.WAIT) return;
      if (!step.label || !step.label.trim()) {
        errors.push(`薬${medNum}の工程表示名を入力してください。`);
      }
      const sec = step.durationSec;
      if (!Number.isInteger(sec) || sec < 0) {
        errors.push(`薬${medNum}（${step.label || step.type}）の時間は0秒以上の整数で設定してください。`);
      }
    });
  });

  return errors;
}

/** HTMLエスケープ */
export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
