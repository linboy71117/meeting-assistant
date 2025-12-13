chrome.action.onClicked.addListener(async () => {
  
  // 1. 定義我們要開的視窗網址 (指向你的 Vue App)
  const targetUrl = chrome.runtime.getURL("index.html");

  // 2. 檢查是否已經有開過的視窗？(避免重複開一大堆)
  const existingWindows = await chrome.windows.getAll({ populate: true });
  
  // 搜尋有沒有哪個視窗的 Tab 網址跟我們的一樣
  let existingWinId = null;
  
  for (const win of existingWindows) {
    if (win.tabs && win.tabs.length > 0) {
      // 檢查該視窗的第一個分頁是否為我們的 App
      if (win.tabs[0].url && win.tabs[0].url.startsWith(targetUrl)) {
        existingWinId = win.id;
        break;
      }
    }
  }

  // 3. 判斷邏輯
  if (existingWinId) {
    // A. 如果已經開了，就把它「帶到最前面」(Focus)
    chrome.windows.update(existingWinId, { focused: true });
  } else {
    // B. 如果沒開，就「建立新視窗」
    chrome.windows.create({
      url: targetUrl,
      type: "popup", // "popup" 類型沒有網址列和書籤列，看起來像獨立 App
      width: 450,    // 設定你想要的寬度
      height: 700,   // 設定你想要的高度
      focused: true
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // 檢查是否有特定 Meet 分頁開啟
  if (message.action === 'checkMeetTab') {
    const meetCode = message.meetCode;
    
    if (!meetCode) {
      sendResponse({ isInMeeting: false });
      return true;
    }

    chrome.tabs.query({}, (tabs) => {
      console.log("[background] All tabs:", tabs.map(t => t.url))
      const found = tabs.some((tab) => 
        tab.url && tab.url.includes(`meet.google.com/${meetCode}`)
      );


    console.log("[background] Found meet tab:", found); // ← 加入這行
    sendResponse({ isInMeeting: found });
    });

    return true; // 表示會異步回應
  }

  // ...existing code...
});

// 監聽分頁更新，通知 popup
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.includes('meet.google.com')) {
    // 廣播給所有 extension 頁面
    chrome.runtime.sendMessage({ 
      action: 'meetTabChanged',
      url: changeInfo.url 
    }).catch(() => {}); // 忽略無接收者的錯誤
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  chrome.runtime.sendMessage({ 
    action: 'meetTabClosed',
    tabId: tabId 
  }).catch(() => {});
});