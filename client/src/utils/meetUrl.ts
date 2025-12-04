/* eslint-disable */
// @ts-ignore
declare const chrome: any;
/* eslint-enable */

/**
 * 解析 Google Meet 的房號
 * 例如: https://meet.google.com/abc-defg-hij
 */
export function extractMeetCode(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("meet.google.com")) return null;

    const parts = u.pathname.split("/").filter(Boolean);
    const code = parts[0];

    // Google Meet 的房號格式：xxx-yyyy-zzz
    if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(code)) return code;

    return null;
  } catch {
    return null;
  }
}

/**
 * 取得目前 tab 的 Google Meet 房號
 */
export async function getCurrentMeetCode(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query(
        { active: true, currentWindow: true },
        (tabs: any[]) => {
          if (!tabs || !tabs[0] || !tabs[0].url) {
            resolve(null);
            return;
          }
          resolve(extractMeetCode(tabs[0].url));
        }
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * ⭐ 建立新的 Google Meet 房間
 * 使用 chrome.tabs.create → https://meet.google.com/new
 * 並監聽 Google 自動跳轉到真正的房號網址
 */
export function createNewMeet(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.create({ url: "https://meet.google.com/new" }, (tab: any) => {
        if (!tab || !tab.id) {
          resolve(null);
          return;
        }

        const targetTabId = tab.id;

        const listener = (tabId: number, changeInfo: any) => {
          if (tabId !== targetTabId) return;
          if (!changeInfo.url) return;

          const meetCode = extractMeetCode(changeInfo.url);
          if (meetCode) {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(meetCode);
          }
        };

        chrome.tabs.onUpdated.addListener(listener);
      });
    } catch (e) {
      console.error("createNewMeet error:", e);
      resolve(null);
    }
  });
}

/**
 * 依照 Google Meet 的「真正房號」開啟 Google Meet
 * （不是 InviteCode）
 */
export function openMeetWithCode(code: string | null) {
  if (!code) return;
  try {
    chrome.tabs.create({ url: `https://meet.google.com/${code}` });
  } catch (e) {
    console.error("openMeetWithCode error:", e);
  }
}

/**
 * 依照 Google Meet 完整 URL 開會
 * 例如: "https://meet.google.com/abc-defg-hij"
 */
export function openMeetUrl(url: string | null) {
  if (!url) return;
  try {
    chrome.tabs.create({ url });
  } catch (e) {
    console.error("openMeetUrl error:", e);
  }
}
