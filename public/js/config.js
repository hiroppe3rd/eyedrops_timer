// アプリ設定（公開可能な情報のみ定義）
export const CONFIG = {
  // Google Cloud Console で発行した OAuth クライアント ID を設定
  GOOGLE_CLIENT_ID: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
  // 最小権限スコープ（予定の作成・編集のみ）
  GOOGLE_CALENDAR_SCOPE: "https://www.googleapis.com/auth/calendar.events",
  // 登録先カレンダー（primary 固定）
  CALENDAR_ID: "primary",
};
