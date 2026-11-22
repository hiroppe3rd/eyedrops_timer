// 受け入れ確認項目に基づく自動検証テストスイート
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  DURATION_TEMPLATES,
  STEP_TYPES,
  calcWorkoutTotalSeconds,
  createDefaultWorkout,
  formatDuration,
  normalizeWorkoutSteps,
  parseDurationInput,
  validateWorkout,
} from "../public/js/models.js";
import { SCHEMA_VERSION, loadAppData, saveAppData } from "../public/js/storage.js";
import { buildExecutionQueue, createTimerRunner, formatClock } from "../public/js/timerEngine.js";
import {
  buildStepCompleteSpeech,
  buildStepStartSpeech,
  resolvePreferredVoice,
} from "../public/js/speech.js";
import {
  buildCalendarEventPayload,
  isClientIdConfigured,
  saveWorkoutToGoogleCalendar,
} from "../public/js/calendar.js";
import { CONFIG } from "../public/js/config.js";

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS: ${name}`);
}

// 1. 全JSファイルの構文チェック
await test("全JSファイルの構文エラーがないこと", () => {
  const jsFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) jsFiles.push(full);
    }
  };
  walk(path.resolve("public/js"));
  assert.ok(jsFiles.length >= 8);
  for (const file of jsFiles) {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  }
});

// 2. models.js の検証
await test("時間テンプレート11種・手入力換算・バリデーション", () => {
  assert.equal(DURATION_TEMPLATES.length, 11);
  assert.equal(parseDurationInput("1.5", "min"), 90);
  assert.equal(parseDurationInput("0", "sec"), 0);
  assert.equal(parseDurationInput("-1", "sec"), null);
  assert.equal(parseDurationInput("0.01", "min"), null);
  assert.equal(formatDuration(90), "1分30秒");
  assert.equal(formatDuration(0), "0秒（省略）");

  const wo = createDefaultWorkout();
  assert.deepEqual(validateWorkout(wo).length, 2);

  wo.name = "朝の点眼";
  wo.medications[0].name = "ヒアルロン酸";
  wo.medications.push({
    id: "m2",
    name: "抗菌目薬",
    steps: [
      { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 10 },
      { type: STEP_TYPES.MEDITATION, label: "瞑想", durationSec: 60 },
      { type: STEP_TYPES.WAIT, label: "待機", durationSec: 300 },
    ],
  });
  wo.medications = normalizeWorkoutSteps(wo.medications);
  assert.equal(wo.medications[0].steps.length, 3);
  // 最後の薬に待機工程がないこと
  assert.equal(wo.medications[1].steps.length, 2);
  assert.equal(validateWorkout(wo).length, 0);
  assert.equal(calcWorkoutTotalSeconds(wo), 15 + 60 + 300 + 10 + 60);
});

// 3. storage.js の永続化・復元検証
await test("localStorage 永続化・復元・スキーマバージョン", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };

  const initial = loadAppData();
  assert.equal(initial.schemaVersion, SCHEMA_VERSION);
  assert.equal(initial.voiceSettings.voiceName, "Google 日本語");
  assert.equal(initial.voiceSettings.rate, 1.0);

  initial.workouts.push({ id: "wo_1", name: "夜点眼", order: 0, medications: [] });
  initial.voiceSettings = { voiceName: "Microsoft Haruka", rate: 1.15 };
  initial.pendingResults.push({ executionId: "ex_1", workoutName: "夜点眼", calendarStatus: "unsaved" });
  saveAppData(initial);

  const reloaded = loadAppData();
  assert.equal(reloaded.workouts.length, 1);
  assert.equal(reloaded.voiceSettings.voiceName, "Microsoft Haruka");
  assert.equal(reloaded.voiceSettings.rate, 1.15);
  assert.equal(reloaded.pendingResults.length, 1);

  // 破損JSON時もクラッシュしないこと
  store.set("eyedrops_timer_data", "{broken-json");
  const recovered = loadAppData();
  assert.equal(recovered.schemaVersion, SCHEMA_VERSION);
});

// 4. timerEngine.js の動作検証（5秒未満カウントダウン・背景補正・一時停止・スキップ）
await test("タイマーの実行・5秒未満カウントダウン・背景補正・一時停止・スキップ", () => {
  let fakeNow = 1_000_000;
  const origNow = Date.now;
  Date.now = () => fakeNow;

  const intervals = new Map();
  let nextTimerId = 1;
  globalThis.window = {
    setInterval: (fn) => {
      const id = nextTimerId++;
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (id) => {
      intervals.delete(id);
    },
  };

  try {
    const queue = buildExecutionQueue({
      medications: [
        {
          name: "薬A",
          steps: [
            { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 3 },
            { type: STEP_TYPES.MEDITATION, label: "瞑想", durationSec: 0 },
            { type: STEP_TYPES.WAIT, label: "待機", durationSec: 10 },
          ],
        },
        {
          name: "薬B",
          steps: [
            { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 5 },
            { type: STEP_TYPES.MEDITATION, label: "瞑想", durationSec: 6 },
            { type: STEP_TYPES.WAIT, label: "待機", durationSec: 300 },
          ],
        },
      ],
    });
    assert.equal(queue.length, 4);
    assert.equal(formatClock(65), "01:05");

    const countdowns = [];
    const completed = [];
    let allDone = null;

    const runner = createTimerRunner(queue, {
      onCountdown: (sec) => countdowns.push(sec),
      onStepComplete: (step) => completed.push(step.medName + ":" + step.type),
      onAllComplete: (res) => {
        allDone = res;
      },
    });

    runner.start();
    // 3秒工程の開始直後に3が鳴り、1秒後・2秒後に2, 1が鳴ること
    fakeNow += 1000;
    runner.syncNow();
    fakeNow += 1000;
    runner.syncNow();
    assert.deepEqual(countdowns, [3, 2, 1]);

    // 1秒進めて薬A:prepare完了 → 薬A:wait(10秒)開始
    fakeNow += 1000;
    runner.syncNow();
    assert.deepEqual(completed, ["薬A:prepare"]);

    // 一時停止して3秒経過しても再開時の残りは10秒のまま
    runner.pause();
    fakeNow += 3000;
    runner.resume();
    fakeNow += 5000;
    runner.syncNow();
    assert.equal(allDone, null);

    // スキップで薬B:prepare(5秒)へ
    runner.skip();
    // バックグラウンドで12秒経過（薬B:prepare 5秒 + 薬B:meditation 6秒 = 11秒超過）→ 完了へ
    fakeNow += 12000;
    runner.syncNow();
    assert.ok(allDone !== null);
  } finally {
    Date.now = origNow;
  }
});

// 5. speech.js の音声解決・発話生成検証
await test("Google 日本語優先選択と点眼ガイド文生成", () => {
  const voices = [
    { name: "Microsoft Ayumi", lang: "ja-JP" },
    { name: "Google 日本語", lang: "ja-JP" },
  ];
  assert.equal(resolvePreferredVoice(voices, "").name, "Google 日本語");
  assert.equal(resolvePreferredVoice(voices, "Microsoft Ayumi").name, "Microsoft Ayumi");
  assert.equal(resolvePreferredVoice(voices, "存在しない音声").name, "Google 日本語");

  const startTxt = buildStepStartSpeech(
    { medIndex: 0, medName: "ヒアルロン酸", type: STEP_TYPES.MEDITATION, label: "直後の瞑想", durationSec: 60 },
    { medIndex: 0, type: STEP_TYPES.PREPARE }
  );
  assert.equal(startTxt, "ヒアルロン酸 を点眼してください。続けて、直後の瞑想、1分、開始。");
  assert.equal(buildStepCompleteSpeech({ label: "準備" }), "準備、完了。");
});

// 6. calendar.js の認証拒否・通信失敗・再試行成功検証
await test("Googleカレンダー連携: 認証拒否・通信失敗・再試行成功", async () => {
  const origClientId = CONFIG.GOOGLE_CLIENT_ID;
  CONFIG.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";

  const sampleResult = {
    workoutName: "朝の点眼",
    startedAt: "2026-11-22T08:00:00.000Z",
    completedAt: "2026-11-22T08:05:00.000Z",
  };
  assert.equal(isClientIdConfigured(), true);
  assert.equal(buildCalendarEventPayload(sampleResult).summary, "朝の点眼");

  let mockAuthBehavior = "deny";
  globalThis.window = {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }) => ({
            requestAccessToken: () => {
              if (mockAuthBehavior === "deny") {
                callback({ error: "access_denied" });
              } else {
                callback({ access_token: "mock-token" });
              }
            },
          }),
        },
      },
    },
  };

  try {
    // 認証拒否
    await assert.rejects(
      () => saveWorkoutToGoogleCalendar(sampleResult),
      /認証・権限付与が拒否/
    );

    // 認証成功・通信失敗
    mockAuthBehavior = "ok";
    globalThis.fetch = async () => {
      throw new Error("Network down");
    };
    await assert.rejects(
      () => saveWorkoutToGoogleCalendar(sampleResult),
      /通信エラーが発生しました/
    );

    // 再試行で成功
    globalThis.fetch = async (url, opts) => {
      assert.ok(url.endsWith("/calendars/primary/events"));
      assert.equal(opts.method, "POST");
      return {
        ok: true,
        json: async () => ({ id: "evt_1", htmlLink: "https://calendar.google.com/event?eid=1" }),
      };
    };
    const created = await saveWorkoutToGoogleCalendar(sampleResult);
    assert.equal(created.id, "evt_1");
  } finally {
    CONFIG.GOOGLE_CLIENT_ID = origClientId;
  }
});

console.log(`\n全 ${passed} 件の検証テストが合格しました。`);
