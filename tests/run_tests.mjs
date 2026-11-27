// 受け入れ確認項目に基づく自動検証テストスイート
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  DURATION_TEMPLATES,
  MEDICATION_TEMPLATES,
  STEP_TYPES,
  appendMedicationsRemovingEmpty,
  calcRoutineTotalSeconds,
  calcWaitRemainderSeconds,
  cloneMedicationForAdd,
  createDefaultRoutine,
  extractExistingMedications,
  formatDateTime,
  formatDuration,
  getStepLabel,
  normalizeRoutineSteps,
  parseDurationInput,
  removePendingResult,
  validateRoutine,
} from "../public/js/models.js";
import { SCHEMA_VERSION, loadAppData, saveAppData } from "../public/js/storage.js";
import { buildExecutionQueue, createTimerRunner, formatClock } from "../public/js/timerEngine.js";
import {
  SpeechGuideController,
  buildRoutineCompleteSpeech,
  buildStepCompleteSpeech,
  buildStepStartSpeech,
  normalizeSpeechText,
  resolvePreferredVoice,
} from "../public/js/speech.js";
import {
  buildGoogleCalendarEventPayload,
  buildGoogleCalendarTemplateUrl,
  formatGoogleCalendarDate,
  openGoogleCalendarTemplate,
  saveResultToGoogleCalendar,
} from "../public/js/calendar.js";
import { getRuntimeConfig } from "../public/js/config.js";
import { parseEnvContent } from "../scripts/generate-config.mjs";
import {
  isIosSafariUserAgent,
  isStandaloneDisplayMode,
  shouldShowInstallButton,
} from "../public/js/pwaInstall.js";
import { createNavigationGuard } from "../public/js/navigationGuard.js";

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

  const rt = createDefaultRoutine();
  assert.deepEqual(validateRoutine(rt).length, 2);

  rt.name = "朝の点眼";
  rt.medications[0].name = "ヒアルロン酸";
  rt.medications.push({
    id: "m2",
    name: "抗菌目薬",
    steps: [
      { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 10 },
      { type: STEP_TYPES.MEDITATION, label: "閉眼", durationSec: 60 },
      { type: STEP_TYPES.WAIT, label: "待機", durationSec: 300 },
    ],
  });
  rt.medications = normalizeRoutineSteps(rt.medications);
  assert.equal(rt.medications[0].steps.length, 3);
  // 工程項目名が固定ラベルへ正規化されること
  assert.equal(getStepLabel(STEP_TYPES.PREPARE), "準備");
  assert.equal(getStepLabel(STEP_TYPES.MEDITATION), "点眼後の閉眼");
  assert.equal(getStepLabel(STEP_TYPES.WAIT), "次の点眼までの間隔");
  assert.equal(rt.medications[1].steps[1].label, "点眼後の閉眼");
  // 最後の薬に待機工程がないこと
  assert.equal(rt.medications[1].steps.length, 2);
  assert.equal(validateRoutine(rt).length, 0);
  assert.equal(calcWaitRemainderSeconds(rt.medications[0]), 240);
  assert.equal(calcRoutineTotalSeconds(rt), 15 + 300 + 10 + 60);

  // 未保存履歴の削除・日時整形ヘルパー検証
  const pending = [
    { executionId: "ex_1", routineName: "朝" },
    { executionId: "ex_2", routineName: "夜" },
  ];
  const afterRemove = removePendingResult(pending, "ex_1");
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].executionId, "ex_2");
  assert.equal(formatDateTime(""), "");
  assert.ok(formatDateTime("2026-11-22T08:00:00.000Z").length > 0);
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

  initial.routines.push({ id: "rt_1", name: "夜点眼", order: 0, medications: [] });
  initial.voiceSettings = { voiceName: "Microsoft Haruka", rate: 1.15 };
  initial.pendingResults.push({ executionId: "ex_1", routineName: "夜点眼", calendarStatus: "unsaved" });
  saveAppData(initial);

  const reloaded = loadAppData();
  assert.equal(reloaded.routines.length, 1);
  assert.equal(reloaded.voiceSettings.voiceName, "Microsoft Haruka");
  assert.equal(reloaded.voiceSettings.rate, 1.15);
  assert.equal(reloaded.pendingResults.length, 1);

  // 旧スキーマ(workouts / workoutName)からのマイグレーション確認
  store.set(
    "eyedrops_timer_data",
    JSON.stringify({
      schemaVersion: 1,
      workouts: [{ id: "wo_legacy", name: "旧ルーティン", order: 0, medications: [] }],
      pendingResults: [{ executionId: "ex_old", workoutName: "旧ルーティン", calendarStatus: "unsaved" }],
    })
  );
  const migrated = loadAppData();
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.routines.length, 1);
  assert.equal(migrated.routines[0].name, "旧ルーティン");
  assert.equal(migrated.pendingResults[0].routineName, "旧ルーティン");

  // v2 スキーマ（閉眼＋追加待機）から v3（点眼間隔基準）へのマイグレーション確認
  store.set(
    "eyedrops_timer_data",
    JSON.stringify({
      schemaVersion: 2,
      routines: [
        {
          id: "rt_v2",
          name: "術後点眼",
          order: 0,
          medications: [
            {
              id: "m1",
              name: "レボフロキサシン",
              steps: [
                { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 10 },
                { type: STEP_TYPES.MEDITATION, label: "直後の閉眼", durationSec: 120 },
                { type: STEP_TYPES.WAIT, label: "次の点眼までの待機", durationSec: 180 },
              ],
            },
            {
              id: "m2",
              name: "サンベタゾン",
              steps: [
                { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 10 },
                { type: STEP_TYPES.MEDITATION, label: "直後の閉眼", durationSec: 120 },
              ],
            },
          ],
        },
      ],
    })
  );
  const migratedV3 = loadAppData();
  assert.equal(migratedV3.schemaVersion, SCHEMA_VERSION);
  const waitStepV3 = migratedV3.routines[0].medications[0].steps[2];
  assert.equal(waitStepV3.durationSec, 300);
  assert.equal(waitStepV3.label, "次の点眼までの間隔");

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
            { type: STEP_TYPES.MEDITATION, label: "閉眼", durationSec: 0 },
            { type: STEP_TYPES.WAIT, label: "待機", durationSec: 10 },
          ],
        },
        {
          name: "薬B",
          steps: [
            { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 5 },
            { type: STEP_TYPES.MEDITATION, label: "閉眼", durationSec: 6 },
            { type: STEP_TYPES.WAIT, label: "待機", durationSec: 300 },
          ],
        },
      ],
    });
    assert.equal(queue.length, 4);
    assert.equal(formatClock(65), "01:05");

    const countdowns = [];
    const completed = [];
    const completedLastFlags = [];
    let allDone = null;

    const runner = createTimerRunner(queue, {
      onCountdown: (sec) => countdowns.push(sec),
      onStepComplete: (step, _skipped, isLastStep) => {
        completed.push(step.medName + ":" + step.type);
        completedLastFlags.push(isLastStep);
      },
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
    assert.equal(completedLastFlags[0], false);
    assert.equal(completedLastFlags[completedLastFlags.length - 1], true);
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
    { medIndex: 0, medName: "ヒアルロン酸", type: STEP_TYPES.MEDITATION, label: "点眼後の閉眼", durationSec: 60 },
    { medIndex: 0, type: STEP_TYPES.PREPARE }
  );
  assert.equal(startTxt, "ヒアルロン酸 を点眼して、目を閉じてください。1分、開始。");
  assert.equal(
    buildStepStartSpeech(
      { medIndex: 0, medName: "ヒアルロン酸", isFirstStepOfMed: true, type: STEP_TYPES.MEDITATION, label: "点眼後の閉眼", durationSec: 60 },
      null
    ),
    "ヒアルロン酸、目を閉じてください。1分、開始。"
  );
  assert.equal(buildStepCompleteSpeech({ type: STEP_TYPES.PREPARE, label: "準備" }), "準備、完了。");
  assert.equal(buildStepCompleteSpeech({ type: STEP_TYPES.MEDITATION, label: "点眼後の閉眼" }), "目を開けてください。");
  assert.equal(
    buildRoutineCompleteSpeech({ name: "朝の点眼" }),
    "朝の点眼が完了しました。目を開けて大丈夫です。おつかれさまでした。"
  );
  assert.equal(
    buildRoutineCompleteSpeech({ name: "" }),
    "ルーティンが完了しました。目を開けて大丈夫です。おつかれさまでした。"
  );
  assert.equal(normalizeSpeechText("閉眼、完了。"), "へいがん、完了。");

  // 字幕表示と発話テキストの検証
  const origWindow = globalThis.window;
  const origUtterance = globalThis.SpeechSynthesisUtterance;
  try {
    const spokenTexts = [];
    const subtitleTexts = [];
    globalThis.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    globalThis.window = {
      speechSynthesis: {
        speaking: false,
        getVoices: () => voices,
        cancel: () => {},
        speak: (utter) => spokenTexts.push(utter.text),
      },
    };
    const controller = new SpeechGuideController();
    controller.onSubtitle = (txt) => subtitleTexts.push(txt);
    controller.speak(startTxt);
    assert.deepEqual(subtitleTexts, [startTxt]);
    assert.deepEqual(spokenTexts, ["ヒアルロン酸 を点眼して、目を閉じてください。1分、開始。"]);
  } finally {
    globalThis.window = origWindow;
    globalThis.SpeechSynthesisUtterance = origUtterance;
  }
});

// 6. calendar.js の予定作成URL生成・別タブ遷移検証
await test("Googleカレンダー連携: 予定作成URL生成と別タブオープン", () => {
  assert.equal(formatGoogleCalendarDate("2026-11-22T08:00:00.000Z"), "20261122T080000Z");
  assert.equal(formatGoogleCalendarDate("invalid-date"), "");
  assert.equal(formatGoogleCalendarDate(""), "");

  const sampleResult = {
    routineName: "朝の点眼",
    startedAt: "2026-11-22T08:00:00.000Z",
    completedAt: "2026-11-22T08:05:00.000Z",
  };
  const urlString = buildGoogleCalendarTemplateUrl(sampleResult);
  const parsed = new URL(urlString);
  assert.equal(parsed.origin + parsed.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(parsed.searchParams.get("action"), "TEMPLATE");
  assert.equal(parsed.searchParams.get("text"), "朝の点眼");
  assert.equal(parsed.searchParams.get("dates"), "20261122T080000Z/20261122T080500Z");
  assert.equal(parsed.searchParams.get("details"), "点眼タイマーで完了したルーティン記録");

  // window.open が正しい引数で呼ばれること
  let openedArgs = null;
  globalThis.window = {
    open: (url, target, features) => {
      openedArgs = { url, target, features };
    },
  };
  const returnedUrl = openGoogleCalendarTemplate(sampleResult);
  assert.equal(returnedUrl, urlString);
  assert.deepEqual(openedArgs, {
    url: urlString,
    target: "_blank",
    features: "noopener,noreferrer",
  });
});

// 7. 行程の複製・テンプレート・既存抽出・備考（非読み上げ）の検証
await test("行程テンプレート・既存抽出・複製・備考の保持と非読み上げ", () => {
  assert.ok(MEDICATION_TEMPLATES.length >= 4);
  const tpl = MEDICATION_TEMPLATES[0];
  const cloned = cloneMedicationForAdd(tpl);
  assert.ok(cloned.id.startsWith("med_"));
  assert.equal(cloned.name, tpl.name);
  assert.equal(cloned.steps.length, 3);

  // 既存ルーティンからの抽出・重複統合
  const routines = [
    {
      id: "rt_1",
      name: "朝",
      medications: [
        {
          id: "m1",
          name: "ヒアルロン酸",
          note: "1回1滴",
          steps: [
            { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 15 },
            { type: STEP_TYPES.MEDITATION, label: "直後の閉眼", durationSec: 60 },
            { type: STEP_TYPES.WAIT, label: "次の点眼までの待機", durationSec: 300 },
          ],
        },
        { id: "m2", name: "", note: "空名は除外", steps: [] },
      ],
    },
    {
      id: "rt_2",
      name: "夜",
      medications: [
        {
          id: "m3",
          name: "ヒアルロン酸",
          note: "1回1滴",
          steps: [
            { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 15 },
            { type: STEP_TYPES.MEDITATION, label: "直後の閉眼", durationSec: 60 },
            { type: STEP_TYPES.WAIT, label: "次の点眼までの待機", durationSec: 300 },
          ],
        },
      ],
    },
  ];
  const extracted = extractExistingMedications(routines);
  assert.equal(extracted.length, 1);
  assert.deepEqual(extracted[0].sourceRoutineNames, ["朝", "夜"]);
  assert.equal(extracted[0].note, "1回1滴");

  // 備考がキューに含まれても読み上げ文には含まれないこと
  const queue = buildExecutionQueue(routines[0]);
  assert.equal(queue[0].medNote, "1回1滴");
  const speechText = buildStepStartSpeech(queue[0]);
  assert.ok(!speechText.includes("1回1滴"));

  // テンプレート・既存追加時に薬名が空の行程を除外すること
  const initialRt = createDefaultRoutine();
  const addedTpl = cloneMedicationForAdd(MEDICATION_TEMPLATES[0]);
  const afterNewAdd = appendMedicationsRemovingEmpty(initialRt.medications, [addedTpl]);
  assert.equal(afterNewAdd.length, 1);
  assert.equal(afterNewAdd[0].name, MEDICATION_TEMPLATES[0].name);
  assert.equal(afterNewAdd[0].steps.length, 2);

  // 入力済みと空の行程が混在する編集時は空のみ除外して追加されること
  const mixedCurrent = [
    { id: "m_ok", name: "ヒアルロン酸", note: "", steps: [] },
    { id: "m_blank", name: "   ", note: "", steps: [] },
  ];
  const addedTpl2 = cloneMedicationForAdd(MEDICATION_TEMPLATES[1]);
  const afterEditAdd = appendMedicationsRemovingEmpty(mixedCurrent, [addedTpl2]);
  assert.equal(afterEditAdd.length, 2);
  assert.equal(afterEditAdd[0].name, "ヒアルロン酸");
  assert.equal(afterEditAdd[0].steps.length, 3);
  assert.equal(afterEditAdd[1].name, MEDICATION_TEMPLATES[1].name);
  assert.equal(afterEditAdd[1].steps.length, 2);
});

// 8. pwaInstall.js の検証
await test("PWAアプリ登録ボタンの表示・アプリ起動時非表示の判定", () => {
  // スタンドアロン表示判定
  assert.equal(
    isStandaloneDisplayMode(
      { navigator: { standalone: true }, matchMedia: () => ({ matches: false }) },
      { referrer: "" }
    ),
    true
  );
  assert.equal(
    isStandaloneDisplayMode(
      {
        navigator: { standalone: false },
        matchMedia: (q) => ({ matches: q === "(display-mode: standalone)" }),
      },
      { referrer: "" }
    ),
    true
  );
  assert.equal(
    isStandaloneDisplayMode(
      { navigator: { standalone: false }, matchMedia: () => ({ matches: false }) },
      { referrer: "android-app://com.example" }
    ),
    true
  );
  assert.equal(
    isStandaloneDisplayMode(
      { navigator: { standalone: false }, matchMedia: () => ({ matches: false }) },
      { referrer: "https://example.com" }
    ),
    false
  );

  // iOS Safari 判定
  const iphoneSafariUa =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const iphoneChromeUa =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
  assert.equal(isIosSafariUserAgent(iphoneSafariUa, 5), true);
  assert.equal(isIosSafariUserAgent(iphoneChromeUa, 5), false);
  assert.equal(isIosSafariUserAgent("Mozilla/5.0 (Windows NT 10.0)", 0), false);

  // ボタン表示制御
  assert.equal(
    shouldShowInstallButton({
      isStandalone: false,
      hasDeferredPrompt: true,
      isIosSafari: false,
      isInstalled: false,
    }),
    true
  );
  assert.equal(
    shouldShowInstallButton({
      isStandalone: false,
      hasDeferredPrompt: false,
      isIosSafari: true,
      isInstalled: false,
    }),
    true
  );
  // アプリ起動時（standalone）は非表示
  assert.equal(
    shouldShowInstallButton({
      isStandalone: true,
      hasDeferredPrompt: true,
      isIosSafari: true,
      isInstalled: false,
    }),
    false
  );
  // インストール完了後は非表示
  assert.equal(
    shouldShowInstallButton({
      isStandalone: false,
      hasDeferredPrompt: true,
      isIosSafari: false,
      isInstalled: true,
    }),
    false
  );
  // 非対応・イベント未発火時は非表示
  assert.equal(
    shouldShowInstallButton({
      isStandalone: false,
      hasDeferredPrompt: false,
      isIosSafari: false,
      isInstalled: false,
    }),
    false
  );
});

// 9. .env 設定・Google Calendar API 連携の検証
await test(".env パースとランタイム設定の取得", () => {
  const parsed = parseEnvContent(
    '# コメント\nGOOGLE_CLIENT_ID="12345-abc.apps.googleusercontent.com"\nEMPTY_KEY=\n'
  );
  assert.equal(parsed.GOOGLE_CLIENT_ID, "12345-abc.apps.googleusercontent.com");
  assert.equal(parsed.EMPTY_KEY, "");

  const cfg = getRuntimeConfig({ GOOGLE_CLIENT_ID: "  test-client-id  " });
  assert.equal(cfg.googleClientId, "test-client-id");
  assert.equal(getRuntimeConfig(undefined).googleClientId, "");
});

await test("Google Calendar API: ペイロード生成と登録・エラーハンドリング", async () => {
  const sampleResult = {
    executionId: "ex_api_1",
    routineName: "朝の点眼",
    startedAt: "2026-11-24T08:00:00.000Z",
    completedAt: "2026-11-24T08:05:30.000Z",
  };

  const payload = buildGoogleCalendarEventPayload(sampleResult);
  assert.equal(payload.summary, "朝の点眼");
  assert.equal(payload.start.dateTime, "2026-11-24T08:00:00.000Z");
  assert.equal(payload.end.dateTime, "2026-11-24T08:05:30.000Z");

  // クライアント ID 未設定時はエラー
  await assert.rejects(
    () => saveResultToGoogleCalendar(sampleResult, { clientId: "" }),
    /クライアント ID/
  );

  // モックを用いた登録成功確認
  let requestedUrl = "";
  let requestedInit = null;
  const saved = await saveResultToGoogleCalendar(sampleResult, {
    clientId: "mock-client-id",
    requestToken: async () => "mock-access-token",
    fetchImpl: async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "evt_123",
          htmlLink: "https://calendar.google.com/event?eid=evt_123",
        }),
      };
    },
  });
  assert.equal(
    requestedUrl,
    "https://www.googleapis.com/calendar/v3/calendars/primary/events"
  );
  assert.equal(requestedInit.method, "POST");
  assert.equal(requestedInit.headers.Authorization, "Bearer mock-access-token");
  assert.equal(saved.eventId, "evt_123");
  assert.equal(saved.htmlLink, "https://calendar.google.com/event?eid=evt_123");

  // API エラー時（401）
  await assert.rejects(
    () =>
      saveResultToGoogleCalendar(sampleResult, {
        clientId: "mock-client-id",
        requestToken: async () => "expired-token",
        fetchImpl: async () => ({
          ok: false,
          status: 401,
          json: async () => ({ error: { message: "Invalid Credentials" } }),
        }),
      }),
    /Invalid Credentials/
  );
});

// 11. 方針A: 閉眼スキップ時にも点眼間隔が維持されることの検証
await test("閉眼の完了・途中スキップに応じて待機時間が動的に調整され点眼間隔が維持されること", () => {
  let fakeNow = 2_000_000;
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
    const routine = {
      medications: [
        {
          name: "薬1",
          steps: [
            { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 10 },
            { type: STEP_TYPES.MEDITATION, label: "直後の閉眼", durationSec: 120 },
            { type: STEP_TYPES.WAIT, label: "次の点眼までの間隔", durationSec: 300 },
          ],
        },
        {
          name: "薬2",
          steps: [
            { type: STEP_TYPES.PREPARE, label: "準備", durationSec: 10 },
            { type: STEP_TYPES.MEDITATION, label: "直後の閉眼", durationSec: 60 },
          ],
        },
      ],
    };
    const queue = buildExecutionQueue(routine);
    assert.equal(queue[2].durationSec, 180);
    assert.equal(queue[2].intervalSec, 300);

    // ケース1: 閉眼を30秒でスキップ → 待機が270秒に延長され合計300秒間隔を維持
    const startedSteps = [];
    const runner = createTimerRunner(queue, {
      onStepStart: (step) => startedSteps.push({ type: step.type, durationSec: step.durationSec }),
    });
    runner.start();
    fakeNow += 10_000;
    runner.syncNow(); // 薬1:meditation (120秒) 開始
    fakeNow += 30_000;
    runner.skip(); // 30秒時点で閉眼をスキップ

    const waitStart = startedSteps.find((s) => s.type === STEP_TYPES.WAIT);
    assert.equal(waitStart.durationSec, 270);
    runner.destroy();

    // ケース2: 閉眼120秒を最後まで完了 → 待機は180秒
    const startedStepsFull = [];
    const runnerFull = createTimerRunner(queue, {
      onStepStart: (step) => startedStepsFull.push({ type: step.type, durationSec: step.durationSec }),
    });
    runnerFull.start();
    fakeNow += 10_000;
    runnerFull.syncNow(); // 薬1:meditation 開始
    fakeNow += 120_000;
    runnerFull.syncNow(); // 薬1:meditation 完了 → 待機開始

    const waitStartFull = startedStepsFull.find((s) => s.type === STEP_TYPES.WAIT);
    assert.equal(waitStartFull.durationSec, 180);
    runnerFull.destroy();
  } finally {
    Date.now = origNow;
  }
});

// 12. navigationGuard.js の検証
await test("大事な場面のみ beforeunload・popstate で確認を挟み、キャンセル時に元の履歴へ戻ること", () => {
  const listeners = new Map();
  const stack = [{ screen: "init" }];
  let cursor = 0;

  const mockWindow = {
    history: {
      replaceState: (state) => {
        stack[cursor] = state;
      },
      pushState: (state) => {
        stack.splice(cursor + 1);
        stack.push(state);
        cursor = stack.length - 1;
      },
      go: (delta) => {
        cursor += delta;
        const handler = listeners.get("popstate");
        handler?.({ state: stack[cursor] });
      },
    },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };

  let guardState = { shouldConfirm: false, currentScreen: "SCR-01" };
  let confirmResult = false;
  let confirmCount = 0;
  const navigated = [];

  const guard = createNavigationGuard({
    win: mockWindow,
    getGuardState: () => guardState,
    onNavigate: (screen) => navigated.push(screen),
    confirmFn: () => {
      confirmCount += 1;
      return confirmResult;
    },
  });

  guard.init("SCR-01");
  assert.equal(stack[0].screen, "SCR-01");
  assert.equal(stack[0].seq, 0);

  // ガード不要時は beforeunload で抑止しない
  let prevented = false;
  const beforeUnloadHandler = listeners.get("beforeunload");
  beforeUnloadHandler({ preventDefault: () => (prevented = true), returnValue: undefined });
  assert.equal(prevented, false);

  // SCR-04（タイマー実行中）へ遷移しガード有効化
  guard.push("SCR-04", { routineId: "r1" });
  guardState = { shouldConfirm: true, message: "中断しますか？", currentScreen: "SCR-04" };
  assert.equal(guard.getCurrentSeq(), 1);

  // ガード有効時は beforeunload で抑止する
  const unloadEvent = { preventDefault: () => (prevented = true), returnValue: undefined };
  beforeUnloadHandler(unloadEvent);
  assert.equal(prevented, true);
  assert.equal(unloadEvent.returnValue, "");

  // 戻る操作 → キャンセル時は確認が呼ばれ、元の seq=1 に押し戻される
  confirmResult = false;
  mockWindow.history.go(-1);
  assert.equal(confirmCount, 1);
  assert.equal(guard.getCurrentSeq(), 1);
  assert.equal(cursor, 1);
  assert.equal(navigated.length, 0);

  // 戻る操作 → OK時は確認後に SCR-01 へ遷移する
  confirmResult = true;
  mockWindow.history.go(-1);
  assert.equal(confirmCount, 2);
  assert.equal(guard.getCurrentSeq(), 0);
  assert.equal(cursor, 0);
  assert.deepEqual(navigated, ["SCR-01"]);

  guard.destroy();
  assert.equal(listeners.size, 0);
});

console.log(`\n全 ${passed} 件の検証テストが合格しました。`);
