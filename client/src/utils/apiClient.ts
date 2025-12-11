/**
 * API 客戶端工具
 * 根據環境變數選擇後端 URL
 */

/**
 * 取得後端 API 基礎 URL
 */
export function getAPIBase(): string {
  return (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:3000";
}

/**
 * 取得 Google OAuth Client ID
 */
export async function getGoogleClientID(): Promise<string> {
  try {
    const response = await fetch('/oauth/client_secret.json');
    const config = await response.json();
    return config.web?.client_id;
  } catch (error) {
    console.error('Failed to load Google Client ID:', error);
    throw new Error('Unable to load Google Client ID');
  }
}
