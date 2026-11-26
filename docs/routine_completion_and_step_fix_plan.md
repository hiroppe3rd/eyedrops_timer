# ルーティン完了案内追加・工程名固定化・ガイド音声改善 修正計画

以下の3点の改善を実施するための修正計画です。

1. **ルーティン完了後の完了案内（案1：音声アナウンス＋完了チャイム）の追加**
2. **各工程（準備・点眼後の閉眼・次の点眼までの間隔）のテキスト入力廃止と項目名固定化**
3. **閉眼時のガイド音声を「目を閉じてください」へ変更**

---

## 1. ルーティン完了後の完了案内（案1）

### 現状の課題
- [app.js](../public/js/app.js) の `onComplete` では字幕をクリアして即座に完了画面（SCR-05）へ遷移しており、ルーティン全体の完了を知らせる音声・効果音がない。
- 最終工程の完了時に `onStepComplete` で「〇〇、完了。」が鳴るため、全工程が終わったのか次の薬があるのかを耳だけで判別しにくい。

### 変更内容
1. **完了アナウンス文言の生成（[speech.js](../public/js/speech.js)）**
   - `buildRoutineCompleteSpeech(routine)` を追加します。
   - 文言例：
     - ルーティン名がある場合：`「${routine.name}が完了しました。目を開けて大丈夫です。おつかれさまでした。」`
     - ルーティン名が空の場合：`「ルーティンが完了しました。目を開けて大丈夫です。おつかれさまでした。」`
2. **全工程完了用の効果音追加（[speech.js](../public/js/speech.js)）**
   - `playBeep(kind)` に `kind === "routineComplete"` を追加します。
   - 通常の工程完了音（880Hz 単音）と明確に区別できるよう、Web Audio API で **3音の上昇チャイム（例：523Hz → 659Hz → 784Hz）** を鳴らします。
3. **最終工程の個別完了音声をスキップして一本化（[timerEngine.js](../public/js/timerEngine.js) / [app.js](../public/js/app.js)）**
   - `timerEngine.js` の `onStepComplete(completedStep, skippedByBackground, isLastStep)` へ `isLastStep`（`currentIndex === queue.length - 1` 等）を渡すようにします。
   - `app.js` の `onStepComplete` では `isLastStep === true` の場合、`buildStepCompleteSpeech` をスキップします。
   - `app.js` の `onComplete` で `speech.speak(buildRoutineCompleteSpeech(routine), { interrupt: false, fallbackTone: "routineComplete" })` を実行します（SCR-05 へ遷移しても `speech.cancel()` は呼ばず、そのまま鳴り終えるようにします）。

---

## 2. 工程項目名のテキスト入力廃止・固定化

### 現状の課題
- [routineEditView.js](../public/js/views/routineEditView.js) で「準備」「直後の閉眼」「次の点眼までの間隔」のそれぞれに表示名用のテキスト入力欄（`.step-label-input`）があり、入力欄が多く誤編集や大文字時のレイアウト圧迫の原因になっている。

### 変更内容
1. **固定ラベル定義の統一（[models.js](../public/js/models.js)）**
   - `STEP_LABELS` 定数と `getStepLabel(type)` ヘルパーを追加し、以下の項目名に固定します。
     - `STEP_TYPES.PREPARE`: `"準備"`
     - `STEP_TYPES.MEDITATION`: `"点眼後の閉眼"`
     - `STEP_TYPES.WAIT`: `"次の点眼までの間隔"`
   - `MEDICATION_TEMPLATES`、`createDefaultMedication`、`normalizeRoutineSteps` で常に `getStepLabel(type)` を設定します（過去に別名で保存されたデータも正規化時に固定名へ揃えます）。
   - `validateRoutine` から「工程表示名の空文字チェック」を削除します。
2. **タイマーキュー生成の統一（[timerEngine.js](../public/js/timerEngine.js)）**
   - `buildExecutionQueue` でも `label: getStepLabel(step.type)` を使用し、実行時の画面表示名を固定名に統一します。
3. **編集画面の入力欄削除（[routineEditView.js](../public/js/views/routineEditView.js) / [style.css](../public/css/style.css)）**
   - `.step-label-input`（`<input type="text" ...>`）を削除し、**固定の項目名ラベル ＋ 時間設定ボタン（`.btn-duration`）** のシンプルな行構成にします。
   - `syncInputsFromDom()` から `.step-label-input` の読み取り処理を削除します。
   - 重複していたローカル関数 `getStepTypeTitle` は `models.js` の `getStepLabel` に統合します。
   - `style.css` の `.step-input-row` をテキスト入力なし前提のスタイル（固定ラベルと時間ボタンの横並び／折り返し対応）に整理します。

---

## 3. ガイド音声の変更（「閉眼」→「目を閉じてください」）

### 現状の課題
- [speech.js](../public/js/speech.js) の `buildStepStartSpeech` / `buildStepCompleteSpeech` が `step.label`（「直後の閉眼」等）をそのまま読み上げるため、「続けて、直後の閉眼、1分、開始。」のように硬い表現になり、`normalizeSpeechText` で「へいがん」への読み補正が必要になっていました。

### 変更内容
1. **開始時ガイド音声の改善（[speech.js](../public/js/speech.js)）**
   - `buildStepStartSpeech(step, previousStep)` で `step.type === STEP_TYPES.MEDITATION` の場合は `step.label` を読まず、「目を閉じてください」を用いた自然な案内文を返します。
     - 準備の直後に続く場合：
       `「${step.medName} を点眼して、目を閉じてください。${durationText}、開始。」`
     - 薬の最初の工程（準備が0秒で省略された場合）：
       `「${step.medName}、目を閉じてください。${durationText}、開始。」`
     - 上記以外：
       `「目を閉じてください。${durationText}、開始。」`
2. **工程完了時ガイド音声の改善（[speech.js](../public/js/speech.js)）**
   - `buildStepCompleteSpeech(step)` で `step.type === STEP_TYPES.MEDITATION` の場合（次に待機工程や次の薬がある場合のみ再生される）は、「閉眼」を使わず以下のように案内します。
     - `「目を開けてください。」`
3. **画面表示との役割分担**
   - タイマー画面（SCR-04）や確認画面（SCR-03）の項目見出しは固定項目名（「点眼後の閉眼」）を表示し、**音声ガイドと音声字幕のみ「目を閉じてください」** とすることで、視認性と聴覚的な分かりやすさを両立します。

---

## 4. 対象ファイルと検証計画

### 修正対象ファイル
- [models.js](../public/js/models.js)
- [speech.js](../public/js/speech.js)
- [timerEngine.js](../public/js/timerEngine.js)
- [app.js](../public/js/app.js)
- [routineEditView.js](../public/js/views/routineEditView.js)
- [style.css](../public/css/style.css)
- [run_tests.mjs](../tests/run_tests.mjs)

### 検証ステップ
1. [run_tests.mjs](../tests/run_tests.mjs) のテスト更新・追加
   - 工程ラベル固定化（`STEP_LABELS` / `normalizeRoutineSteps` / `validateRoutine`）の検証
   - `buildStepStartSpeech` / `buildStepCompleteSpeech` の「目を閉じてください」文言検証
   - `buildRoutineCompleteSpeech` および最終工程時の `isLastStep` フラグ・`playBeep("routineComplete")` の検証
2. `node tests/run_tests.mjs` を実行し、全テストがパスすることを確認。
3. 編集画面（SCR-02）・確認画面（SCR-03）・タイマー実行（SCR-04）・完了画面（SCR-05）の目視・音声動作確認。
