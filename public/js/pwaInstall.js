// PWA インストールボタンの表示制御と登録案内

/**
 * アプリ起動（スタンドアロン表示）かどうかを判定
 * @param {Window|undefined} win
 * @param {Document|undefined} doc
 * @returns {boolean}
 */
export function isStandaloneDisplayMode(
  win = typeof window !== "undefined" ? window : undefined,
  doc = typeof document !== "undefined" ? document : undefined
) {
  if (!win) return false;
  if (win.navigator && win.navigator.standalone === true) return true;
  if (doc && typeof doc.referrer === "string" && doc.referrer.startsWith("android-app://")) {
    return true;
  }
  if (typeof win.matchMedia === "function") {
    const modes = ["standalone", "fullscreen", "minimal-ui"];
    if (modes.some((mode) => win.matchMedia(`(display-mode: ${mode})`).matches)) {
      return true;
    }
  }
  return false;
}

/**
 * iOS / iPadOS の Safari かどうかを判定
 * @param {string} ua
 * @param {number} maxTouchPoints
 * @returns {boolean}
 */
export function isIosSafariUserAgent(
  ua = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0
) {
  if (!ua) return false;
  const isIosDevice = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  if (!isIosDevice) return false;
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  const isSafari = /Safari/i.test(ua);
  return isSafari && !isOtherBrowser;
}

/**
 * アプリ登録ボタンを表示すべきかを判定
 * @param {{ isStandalone: boolean, hasDeferredPrompt: boolean, isIosSafari: boolean, isInstalled: boolean }} state
 * @returns {boolean}
 */
export function shouldShowInstallButton({
  isStandalone,
  hasDeferredPrompt,
  isIosSafari,
  isInstalled,
}) {
  if (isStandalone || isInstalled) return false;
  return Boolean(hasDeferredPrompt || isIosSafari);
}

/** Service Worker を登録 */
function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (typeof window !== "undefined" && window.location && window.location.protocol === "file:") return;
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // 登録失敗時は標準ブラウザ動作を継続
  });
}

/** iOS Safari 向けホーム画面追加手順モーダルを表示 */
function openIosInstallGuideModal() {
  const existing = document.getElementById("ios-install-guide-modal");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "ios-install-guide-modal";
  backdrop.className = "modal-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "ios-install-guide-title");

  backdrop.innerHTML = `
    <div class="modal-dialog">
      <h2 id="ios-install-guide-title">ホーム画面へのアプリ登録</h2>
      <p class="muted">
        Safari のメニューからホーム画面に追加すると、アイコンからすぐ起動できます。
      </p>
      <ol class="ios-install-steps">
        <li>画面下部（または上部）の<strong>共有ボタン（□に↑）</strong>をタップ</li>
        <li>メニュー内の<strong>「ホーム画面に追加」</strong>を選択</li>
        <li>右上の<strong>「追加」</strong>をタップして完了</li>
      </ol>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" data-close-install-guide>閉じる</button>
      </div>
    </div>
  `;

  const close = () => {
    document.removeEventListener("keydown", onKeyDown);
    backdrop.remove();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") close();
  };

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop || event.target.closest("[data-close-install-guide]")) {
      close();
    }
  });

  document.addEventListener("keydown", onKeyDown);
  document.body.appendChild(backdrop);
}

/**
 * PWA インストールボタンの初期化
 * @param {HTMLButtonElement|null} buttonEl
 */
export function initPwaInstall(buttonEl = document.getElementById("install-app-btn")) {
  registerServiceWorker();
  if (!buttonEl) return;

  let deferredPrompt = null;
  let isInstalled = false;
  const iosSafari = isIosSafariUserAgent();

  const updateVisibility = () => {
    const visible = shouldShowInstallButton({
      isStandalone: isStandaloneDisplayMode(),
      hasDeferredPrompt: Boolean(deferredPrompt),
      isIosSafari: iosSafari,
      isInstalled,
    });
    buttonEl.hidden = !visible;
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    updateVisibility();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    isInstalled = true;
    updateVisibility();
  });

  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(display-mode: standalone)");
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", updateVisibility);
    }
  }

  buttonEl.addEventListener("click", async () => {
    if (deferredPrompt) {
      buttonEl.disabled = true;
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === "accepted") {
          isInstalled = true;
        }
      } catch {
        // ユーザーキャンセル・エラー時は再表示判定のみ実施
      } finally {
        deferredPrompt = null;
        buttonEl.disabled = false;
        updateVisibility();
      }
      return;
    }

    if (iosSafari) {
      openIosInstallGuideModal();
    }
  });

  updateVisibility();
}
