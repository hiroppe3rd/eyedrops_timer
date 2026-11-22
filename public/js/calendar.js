// Google Identity Services 認証と Google Calendar API 連携
import { CONFIG } from "./config.js";

/** クライアントIDが設定済みか判定 */
export function isClientIdConfigured(clientId = CONFIG.GOOGLE_CLIENT_ID) {
  return Boolean(clientId && !clientId.startsWith("YOUR_GOOGLE_CLIENT_ID"));
}

/** カレンダー登録用イベントペイロードを生成 */
export function buildCalendarEventPayload(result) {
  return {
    summary: result.workoutName,
    description: "点眼タイマーで完了したワークアウト記録",
    start: {
      dateTime: result.startedAt,
    },
    end: {
      dateTime: result.completedAt,
    },
  };
}

/** GIS によるアクセストークン取得 */
export function requestGoogleAccessToken() {
  return new Promise((resolve, reject) => {
    if (!isClientIdConfigured()) {
      reject(
        new Error(
          "Google OAuth クライアント ID が未設定です。public/js/config.js に設定してください。"
        )
      );
      return;
    }

    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(
        new Error(
          "Google 認証ライブラリの読み込みに失敗しました。ネットワーク接続を確認して再試行してください。"
        )
      );
      return;
    }

    let settled = false;
    const tokenClient = oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: CONFIG.GOOGLE_CALENDAR_SCOPE,
      callback: (response) => {
        if (settled) return;
        settled = true;
        if (response?.error) {
          if (response.error === "access_denied") {
            reject(new Error("Google アカウントの認証・権限付与が拒否されました。"));
          } else {
            reject(new Error(`Google 認証エラー: ${response.error}`));
          }
          return;
        }
        if (!response?.access_token) {
          reject(new Error("アクセストークンを取得できませんでした。"));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (err) => {
        if (settled) return;
        settled = true;
        if (err?.type === "popup_closed") {
          reject(new Error("認証ポップアップが閉じられました。再度お試しください。"));
        } else if (err?.type === "popup_failed_to_open") {
          reject(new Error("認証ポップアップがブロックされました。ポップアップを許可してください。"));
        } else {
          reject(new Error("Google 認証の起動に失敗しました。"));
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: "" });
  });
}

/** primary カレンダーへ予定を登録 */
export async function insertCalendarEvent(accessToken, result) {
  const calendarId = encodeURIComponent(CONFIG.CALENDAR_ID || "primary");
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  const payload = buildCalendarEventPayload(result);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("通信エラーが発生しました。ネットワーク接続を確認して再試行してください。");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message ? ` (${errJson.error.message})` : "";
    } catch {
      // JSON解析失敗時はステータスコードのみ使用
    }
    throw new Error(`Googleカレンダーへの登録に失敗しました (HTTP ${response.status})${detail}`);
  }

  return response.json();
}

/** 認証からカレンダー登録までを実行 */
export async function saveWorkoutToGoogleCalendar(result) {
  const accessToken = await requestGoogleAccessToken();
  return insertCalendarEvent(accessToken, result);
}

/** 未保存の完了履歴を一括登録（部分成功対応） */
export async function savePendingResultsToGoogleCalendar(results, hooks = {}) {
  const list = Array.isArray(results) ? results : [];
  if (list.length === 0) {
    return { succeededIds: [], failedError: null };
  }

  const accessToken = await requestGoogleAccessToken();
  const succeededIds = [];

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    hooks.onProgress?.(i + 1, list.length, item);
    try {
      const created = await insertCalendarEvent(accessToken, item);
      succeededIds.push(item.executionId);
      hooks.onItemSaved?.(item, created);
    } catch (err) {
      return { succeededIds, failedError: err };
    }
  }

  return { succeededIds, failedError: null };
}
