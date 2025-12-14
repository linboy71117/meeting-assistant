/**
 * Google OAuth Client Manager
 * 統一管理 Google OAuth 2.0 客戶端初始化
 */

const fs = require("fs");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");

let googleOAuthClient = null;

/**
 * 初始化 Google OAuth 2.0 客戶端
 * @returns {OAuth2Client|null}
 */
function initGoogleOAuthClient() {
  if (googleOAuthClient) {
    return googleOAuthClient;
  }

  try {
    const keyPath = process.env.GOOGLE_OAUTH_KEY_PATH || "./oauth/client_secret.json";
    const fullPath = path.resolve(keyPath);
    
    if (!fs.existsSync(fullPath)) {
      console.warn(`[GOOGLE_OAUTH] Key file not found at ${fullPath}`);
      return null;
    }

    const credentials = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const webConfig = credentials.web;
    
    googleOAuthClient = new OAuth2Client(
      webConfig.client_id,
      webConfig.client_secret,
      webConfig.redirect_uris[1]
    );
    
    console.log("[GOOGLE_OAUTH] OAuth2Client initialized successfully");
    return googleOAuthClient;
  } catch (err) {
    console.error("[GOOGLE_OAUTH] Error initializing OAuth2Client:", err);
    return null;
  }
}

/**
 * 取得 Google OAuth 2.0 客戶端（已初始化或初始化後返回）
 * @returns {OAuth2Client|null}
 */
function getGoogleOAuthClient() {
  if (!googleOAuthClient) {
    initGoogleOAuthClient();
  }
  return googleOAuthClient;
}

module.exports = {
  initGoogleOAuthClient,
  getGoogleOAuthClient,
};
