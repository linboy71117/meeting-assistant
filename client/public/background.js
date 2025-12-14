// background.js

const API_BASE = "https://meet-assistant-backend.daxuerdeasthsinchu.dpdns.org";

chrome.action.onClicked.addListener(async () => {
  const appUrl = chrome.runtime.getURL('index.html');
  // Regex: 匹配 Google Meet 網址格式
  const MEET_URL_REGEX = /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/;

  // 1. 取得當前 Active Tab
  let activeTab = null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];
  } catch (e) {
    console.warn("Failed to get active tab", e);
  }

  // -----------------------------------------------------------
  // 情境 A：在 Google Meet 分頁中 -> 呼叫 lookup API -> 插入 Panel
  // -----------------------------------------------------------
  if (activeTab && activeTab.id && activeTab.url) {
    const match = activeTab.url.match(MEET_URL_REGEX);
    
    if (match) {
      const meetCode = match[1]; // 例如 "abc-defg-hij"
      console.log(`[Background] Detected Meet Code: ${meetCode}`);

      // A-1. 呼叫後端 Lookup API
      let targetMeetingId = null;
      try {
        // 使用剛新增的 API
        const foundId = await findMeetingIdByCode(meetCode);
        if (foundId) {
          targetMeetingId = foundId;
          console.log(`[Background] Found ID: ${targetMeetingId}`);
        } else {
          console.log(`[Background] Code ${meetCode} not found in DB.`);
        }
      } catch (err) {
        console.warn("[Background] Lookup API failed:", err);
      }

      // A-2. 通知 Content Script
      // 如果有找到 ID，Panel 會直接載入 Run Mode
      // 如果沒找到 (targetMeetingId 為 null)，Panel 會載入首頁
      const actionPayload = { 
        action: 'show-meeting-panel',
        meetingId: targetMeetingId 
      };

      try {
        await chrome.tabs.sendMessage(activeTab.id, actionPayload);
      } catch (err) {
        // 若 Content Script 未注入，手動注入
        console.log("Injecting content script...");
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['contentScript.js'] 
          });
          
          setTimeout(async () => {
              try {
                  await chrome.tabs.sendMessage(activeTab.id, actionPayload);
              } catch(e) {}
          }, 500); 
        } catch (ex) {
          console.warn('Injection failed', ex);
        }
      }
      return; // 結束，不在外部開啟視窗
    }
  }

  // -----------------------------------------------------------
  // 情境 B：不在 Meet 中 -> 開啟獨立 Popup Window
  // -----------------------------------------------------------
  console.log("[Background] Not in Meet, opening popup window...");
  
  // 清理其他分頁的 Panel
  try {
    const allTabs = await chrome.tabs.query({});
    for (const t of allTabs) {
      if (t.id) chrome.tabs.sendMessage(t.id, { action: 'hide-meeting-panel' }).catch(() => {});
    }
  } catch (e) {}

  // 開啟/聚焦獨立視窗
  try {
    const existingTabs = await chrome.tabs.query({ url: appUrl });
    if (existingTabs.length > 0) {
      const t = existingTabs[0];
      if (t.windowId) {
        await chrome.windows.update(t.windowId, { focused: true });
        await chrome.tabs.update(t.id, { active: true });
      }
      return; 
    }

    await chrome.windows.create({
      url: appUrl,
      type: 'popup',
      width: 400,
      height: 600,
      focused: true
    });
  } catch (e) {
    console.warn('Window create failed', e);
  }
});

/**
 * 使用新的 API 查找 Meeting ID
 */
async function findMeetingIdByCode(code) {
  try {
    // 呼叫後端: GET /api/meetings/lookup?inviteCode=xxx
    const res = await fetch(`${API_BASE}/api/meetings/lookup?inviteCode=${code}`);
    
    if (res.status === 404) return null; // 找不到
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    return data.id; // 回傳 UUID
  } catch (e) {
    console.error("[Background] API error:", e);
    return null;
  }
}