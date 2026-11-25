// 音声合成（Web Speech API）と簡易効果音（Web Audio API）制御
import { STEP_TYPES, formatDuration } from "./models.js";

export const VOICE_RATES = [
  { label: "普通 (1.0x)", value: 1.0 },
  { label: "やや早く (1.15x)", value: 1.15 },
  { label: "早く (1.30x)", value: 1.3 },
];

// 音声合成の誤読を防ぐための読み補正ルール
const SPEECH_READING_CORRECTIONS = [["閉眼", "へいがん"]];

/** 音声合成用に誤読されやすい単語を読みがなへ補正 */
export function normalizeSpeechText(text) {
  if (!text) return "";
  let normalized = String(text);
  for (const [target, reading] of SPEECH_READING_CORRECTIONS) {
    normalized = normalized.replaceAll(target, reading);
  }
  return normalized;
}

/** 日本語音声を優先して並び替え */
export function sortVoicesForJa(voices) {
  return [...voices].sort((a, b) => {
    const aGoogle = a.name.includes("Google 日本語") ? 0 : 1;
    const bGoogle = b.name.includes("Google 日本語") ? 0 : 1;
    if (aGoogle !== bGoogle) return aGoogle - bGoogle;

    const aJa = a.lang?.toLowerCase().startsWith("ja") ? 0 : 1;
    const bJa = b.lang?.toLowerCase().startsWith("ja") ? 0 : 1;
    if (aJa !== bJa) return aJa - bJa;

    return a.name.localeCompare(b.name, "ja");
  });
}

/** 音声設定から最適な音声オブジェクトを選択 */
export function resolvePreferredVoice(voices, savedVoiceName) {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  if (savedVoiceName) {
    const exact = voices.find((v) => v.name === savedVoiceName);
    if (exact) return exact;
  }
  const googleJa = voices.find((v) => v.name.includes("Google 日本語"));
  if (googleJa) return googleJa;
  const anyJa = voices.find((v) => v.lang?.toLowerCase().startsWith("ja"));
  return anyJa || voices[0];
}

/** 音声ガイド・効果音コントローラー */
export class SpeechGuideController {
  constructor(initialSettings = {}) {
    this.voiceName = initialSettings.voiceName || "Google 日本語";
    this.rate = Number(initialSettings.rate) || 1.0;
    this.audioCtx = null;
    this.onSubtitle = null;
  }

  get isSpeechSupported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  getVoices() {
    if (!this.isSpeechSupported) return [];
    return sortVoicesForJa(window.speechSynthesis.getVoices() || []);
  }

  updateSettings({ voiceName, rate }) {
    if (voiceName !== undefined) this.voiceName = voiceName;
    if (rate !== undefined) this.rate = Number(rate) || 1.0;
  }

  /** ユーザー操作イベント内で音声合成とAudioContextをアンロック */
  unlock() {
    if (typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && !this.audioCtx) {
        try {
          this.audioCtx = new AudioCtx();
        } catch {
          this.audioCtx = null;
        }
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
    }

    if (this.isSpeechSupported) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance("");
        utter.volume = 0;
        window.speechSynthesis.speak(utter);
      } catch {
        // 非対応・制限時は効果音フォールバックへ委ねる
      }
    }
  }

  /** 読み上げ実行（非対応時は簡易効果音で通知） */
  speak(text, { interrupt = false, fallbackTone = "start" } = {}) {
    if (!text) return;
    this.onSubtitle?.(text);

    if (!this.isSpeechSupported) {
      this.playBeep(fallbackTone);
      return;
    }

    const voices = this.getVoices();
    const targetVoice = resolvePreferredVoice(voices, this.voiceName);

    try {
      if (interrupt || window.speechSynthesis.speaking) {
        if (interrupt) {
          window.speechSynthesis.cancel();
        }
      }
      const utter = new SpeechSynthesisUtterance(normalizeSpeechText(text));
      utter.lang = targetVoice?.lang || "ja-JP";
      if (targetVoice) utter.voice = targetVoice;
      utter.rate = this.rate;
      utter.onerror = () => {
        this.playBeep(fallbackTone);
      };
      window.speechSynthesis.speak(utter);
    } catch {
      this.playBeep(fallbackTone);
    }
  }

  /** 再生中の読み上げを停止 */
  cancel() {
    if (this.isSpeechSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // 無視
      }
    }
  }

  /** Web Audio API による簡易ビープ音 */
  playBeep(kind = "tick") {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.audioCtx = new AudioCtx();
      } catch {
        return;
      }
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    if (kind === "complete") {
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (kind === "start") {
      osc.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else {
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  }
}

/** 工程開始時の読み上げ文を生成 */
export function buildStepStartSpeech(step, previousStep) {
  const durationText = formatDuration(step.durationSec);
  const isAfterPrepare =
    step.type === STEP_TYPES.MEDITATION &&
    previousStep &&
    previousStep.medIndex === step.medIndex &&
    previousStep.type === STEP_TYPES.PREPARE;

  if (isAfterPrepare) {
    return `${step.medName} を点眼してください。続けて、${step.label}、${durationText}、開始。`;
  }
  if (step.isFirstStepOfMed) {
    return `${step.medName}、${step.label}、${durationText}、開始。`;
  }
  return `${step.label}、${durationText}、開始。`;
}

/** 工程完了時の読み上げ文を生成 */
export function buildStepCompleteSpeech(step) {
  return `${step.label}、完了。`;
}
