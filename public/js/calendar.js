// Google カレンダー連携（URL テンプレート & Google Calendar API）
import { getRuntimeConfig } from "./config.js";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_CALENDAR_EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

let gisScriptPromise = null;

/** ISO 8601 日時文字列を Google カレンダー用 UTC 形式 (YYYYMMDDTHHmmssZ) へ変換 */
export function formatGoogleCalendarDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Google カレンダー予定作成画面の URL を生成 */
export function buildGoogleCalendarTemplateUrl(result) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: result?.routineName || "点眼ルーティン",
    details: "点眼タイマーで完了したルーティン記録",
  });

  const start = formatGoogleCalendarDate(result?.startedAt);
  const end = formatGoogleCalendarDate(result?.completedAt);
  if (start && end) {
    params.set("dates", `${start}/${end}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Google カレンダー予定作成画面を別タブで開く */
export function openGoogleCalendarTemplate(result) {
  const url = buildGoogleCalendarTemplateUrl(result);
  window.open(url, "_blank", "noopener,noreferrer");
  return url;
}

/** Google Calendar API 登録用のイベントペイロードを生成 */
export function buildGoogleCalendarEventPayload(result) {
  const now = new Date();
  const rawStart = result?.startedAt ? new Date(result.startedAt) : now;
  const startDate = Number.isNaN(rawStart.getTime()) ? now : rawStart;

  const rawEnd = result?.completedAt ? new Date(result.completedAt) : startDate;
  let endDate = Number.isNaN(rawEnd.getTime()) ? startDate : rawEnd;
  if (endDate.getTime() < startDate.getTime()) {
    endDate = startDate;
  }

  return {
    summary: result?.routineName || "点眼ルーティン",
    description: "点眼タイマーで完了したルーティン記録",
    start: {
      dateTime: startDate.toISOString(),
    },
    end: {
      dateTime: endDate.toISOString(),
    },
  };
}

/** Google Identity Services (GIS) スクリプトを動的ロード */
export function loadGoogleIdentityScript() {
  if (globalThis.google?.accounts?.oauth2) {
    return Promise.resolve(globalThis.google);
  }
  if (gisScriptPromise) {
    return gisScriptPromise;
  }

  gisScriptPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("ブラウザー環境でのみ Google 認証を実行できます。"));
      return;
    }

    const existing = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(globalThis.google), { once: true });
      existing.addEventListener(
        "error",
        () => {
          gisScriptPromise = null;
          reject(new Error("Google 認証スクリプトの読み込みに失敗しました。"));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (globalThis.google?.accounts?.oauth2) {
        resolve(globalThis.google);
      } else {
        gisScriptPromise = null;
        reject(new Error("Google 認証ライブラリの初期化に失敗しました。"));
      }
    };
    script.onerror = () => {
      gisScriptPromise = null;
      reject(new Error("Google 認証スクリプトの読み込みに失敗しました。"));
    };
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

/** GIS ポップアップで Google Calendar API 用アクセストークンを取得 */
export async function requestCalendarAccessToken(clientId) {
  if (!clientId) {
    throw new Error("Google クライアント ID が設定されていません。.env を確認してください。");
  }

  const googleObj = await loadGoogleIdentityScript();
  const oauth2 = googleObj?.accounts?.oauth2;
  if (!oauth2?.initTokenClient) {
    throw new Error("Google OAuth2 クライアントを利用できません。");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: (response) => {
        if (settled) return;
        settled = true;
        if (response?.error || !response?.access_token) {
          const reason = response?.error_description || response?.error || "認証が拒否されました";
          reject(new Error(`Google 認証に失敗しました（${reason}）`));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (err) => {
        if (settled) return;
        settled = true;
        const type = err?.type || "unknown";
        if (type === "popup_closed") {
          reject(new Error("Google 認証ポップアップが閉じられました。"));
          return;
        }
        if (type === "popup_failed_to_open") {
          reject(new Error("ポップアップがブロックされました。ブラウザーの設定を確認してください。"));
          return;
        }
        reject(new Error(`Google 認証エラーが発生しました（${type}）`));
      },
    });

    tokenClient.requestAccessToken({ prompt: "" });
  });
}

/** Google Calendar API で primary カレンダーへ予定を登録 */
export async function insertGoogleCalendarEvent(accessToken, result, fetchImpl = globalThis.fetch) {
  if (!accessToken) {
    throw new Error("アクセストークンが取得できませんでした。");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("通信機能（fetch）が利用できません。");
  }

  const payload = buildGoogleCalendarEventPayload(result);
  const response = await fetchImpl(GOOGLE_CALENDAR_EVENTS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.error?.message) {
        detail = errBody.error.message;
      }
    } catch {
      // レスポンス本文が JSON でない場合はステータスのみ使用
    }
    if (response.status === 401) {
      throw new Error(`認証の有効期限が切れているか無効です（${detail}）。再試行してください。`);
    }
    throw new Error(`Google カレンダーへの登録に失敗しました（${detail}）。`);
  }

  const data = await response.json();
  return {
    eventId: data?.id || "",
    htmlLink: data?.htmlLink || "",
  };
}

/** 認証から Google Calendar API 登録までを一括実行 */
export async function saveResultToGoogleCalendar(result, options = {}) {
  const clientId = (options.clientId ?? getRuntimeConfig().googleClientId ?? "").trim();
  if (!clientId) {
    throw new Error("Google クライアント ID が設定されていません。.env を確認してください。");
  }

  const requestToken = options.requestToken || requestCalendarAccessToken;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  const accessToken = await requestToken(clientId);
  return insertGoogleCalendarEvent(accessToken, result, fetchImpl);
}
