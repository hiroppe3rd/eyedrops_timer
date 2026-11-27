// ブラウザ離脱（リロード・タブ閉じ）および履歴移動（戻る・進む）のガード制御

/** ナビゲーションガードを生成 */
export function createNavigationGuard({
  win = typeof window !== "undefined" ? window : null,
  getGuardState,
  onNavigate,
  confirmFn,
} = {}) {
  const historyObj = win?.history ?? null;
  const resolveConfirm =
    typeof confirmFn === "function"
      ? confirmFn
      : (message) => (typeof win?.confirm === "function" ? win.confirm(message) : true);

  let currentSeq = 0;
  let isRestoring = false;
  let initialized = false;

  /** リロード・タブ閉じ・外部遷移前の確認 */
  const handleBeforeUnload = (event) => {
    const guard = getGuardState?.();
    if (!guard?.shouldConfirm) return;
    event.preventDefault();
    if (event && "returnValue" in event) {
      event.returnValue = "";
    }
    return "";
  };

  /** ブラウザの戻る・進む時の確認 */
  const handlePopState = (event) => {
    if (isRestoring) {
      isRestoring = false;
      return;
    }

    const targetState =
      event?.state && typeof event.state === "object"
        ? event.state
        : { screen: "SCR-01", seq: 0 };
    const nextSeq = typeof targetState.seq === "number" ? targetState.seq : 0;
    const delta = nextSeq - currentSeq;

    const guard = getGuardState?.();
    if (guard?.shouldConfirm) {
      const ok = Boolean(resolveConfirm(guard.message || "移動してもよろしいですか？"));
      if (!ok) {
        if (historyObj && typeof historyObj.go === "function") {
          isRestoring = true;
          historyObj.go(delta > 0 ? -1 : 1);
        }
        return;
      }
    }

    currentSeq = nextSeq;
    onNavigate?.(targetState.screen || "SCR-01", targetState);
  };

  /** イベント登録と初期履歴の設定 */
  const init = (initialScreen = "SCR-01") => {
    if (initialized || !win) return;
    initialized = true;
    currentSeq = 0;
    if (historyObj && typeof historyObj.replaceState === "function") {
      historyObj.replaceState({ screen: initialScreen, seq: 0 }, "");
    }
    win.addEventListener("beforeunload", handleBeforeUnload);
    win.addEventListener("popstate", handlePopState);
  };

  /** イベント解除 */
  const destroy = () => {
    if (!initialized || !win) return;
    win.removeEventListener("beforeunload", handleBeforeUnload);
    win.removeEventListener("popstate", handlePopState);
    initialized = false;
  };

  /** 履歴を1段追加 */
  const push = (screen, meta = {}) => {
    currentSeq += 1;
    if (historyObj && typeof historyObj.pushState === "function") {
      historyObj.pushState({ ...meta, screen, seq: currentSeq }, "");
    }
  };

  /** 現在の履歴を置換 */
  const replace = (screen, meta = {}) => {
    if (historyObj && typeof historyObj.replaceState === "function") {
      historyObj.replaceState({ ...meta, screen, seq: currentSeq }, "");
    }
  };

  /** 現在の履歴シーケンス番号を取得 */
  const getCurrentSeq = () => currentSeq;

  return {
    init,
    destroy,
    push,
    replace,
    getCurrentSeq,
  };
}
