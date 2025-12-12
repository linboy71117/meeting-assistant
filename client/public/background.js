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
      width: 360,    // 設定你想要的寬度
      height: 660,   // 設定你想要的高度
      focused: true
    });
  }
});