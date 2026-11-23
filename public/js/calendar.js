// Google カレンダー予定作成画面（URL テンプレート）連携

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
