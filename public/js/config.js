// アプリ設定
export function getRuntimeConfig(envObj = globalThis.__EYEDROPS_ENV__) {
  const clientId = typeof envObj?.GOOGLE_CLIENT_ID === "string"
    ? envObj.GOOGLE_CLIENT_ID.trim()
    : "";
  return {
    googleClientId: clientId,
  };
}

export const CONFIG = getRuntimeConfig();
