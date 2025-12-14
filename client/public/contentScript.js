// client/public/contentScript.js

const PANEL_ID = 'ai-meeting-assistant-panel';

function removePanel() {
  const existingPanel = document.getElementById(PANEL_ID);
  if (existingPanel) existingPanel.remove();
}

/**
 * 建立 Panel
 * @param {string} routePath - Vue Router 路徑 (如 /meetings/xxx/run 或 /)
 */
function createPanel(routePath = '/') {
  removePanel();

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  
  // 樣式：固定在右側
  Object.assign(panel.style, {
    position: 'fixed',
    right: '16px',
    top: '64px',       
    bottom: '90px',    
    width: '360px',
    zIndex: '2147483647', // Max Z-Index
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Google Sans", Roboto, Arial, sans-serif'
  });

  // Header UI
  panel.innerHTML = `
    <div class="ai-panel-header" style="background:#fff; border-bottom:1px solid #f1f3f4; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="color:#1a73e8; font-size:16px;">🤖</span>
        <span style="font-weight:500; color:#3c4043; font-size:14px;">Meeting Assistant</span>
      </div>
      <button id="ai-panel-close" style="background:transparent; border:none; color:#5f6368; font-size:20px; cursor:pointer; width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:50%;">&times;</button>
    </div>
    <iframe id="ai-panel-iframe" frameborder="0" style="width:100%; flex:1; border:0; display:block;"></iframe>
  `;

  document.body.appendChild(panel);

  // 設定 iframe 網址 (Extension Index + Hash Route)
  const iframe = panel.querySelector('#ai-panel-iframe');
  iframe.src = chrome.runtime.getURL(`index.html#${routePath}`);

  // 關閉按鈕
  const closeBtn = panel.querySelector('#ai-panel-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removePanel();
  });
  closeBtn.onmouseenter = () => closeBtn.style.backgroundColor = '#f1f3f4';
  closeBtn.onmouseleave = () => closeBtn.style.backgroundColor = 'transparent';

  // 啟動拖曳
  setupDraggable(panel);
}

function setupDraggable(panel) {
  let isDragging = false;
  // 紀錄「開始拖曳當下」的狀態
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;

  const header = panel.querySelector('.ai-panel-header');
  if (!header) return;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return; // 忽略按鈕點擊

    isDragging = true;
    startX = e.clientX; 
    startY = e.clientY;

    // 1. 取得當前實際位置與尺寸
    const rect = panel.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    // 2. 【關鍵】鎖定尺寸 (將 computed style 轉為 inline style)
    // 這防止了當我們移除 bottom 屬性時，高度塌陷
    panel.style.width = `${rect.width}px`;
    panel.style.height = `${rect.height}px`;

    // 3. 設定初始位置為絕對座標 (px)，並解除相對約束
    panel.style.left = `${initialLeft}px`;
    panel.style.top = `${initialTop}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    
    // 4. 加入遮罩防止 iframe 吃掉事件
    const overlay = document.createElement('div');
    overlay.id = 'drag-overlay';
    Object.assign(overlay.style, {
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, cursor: 'move'
    });
    panel.appendChild(overlay);
    
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    // 計算位移量
    const dx = e.clientX - startX; 
    const dy = e.clientY - startY;
    
    // 設定新位置 = 初始位置 + 位移量
    panel.style.left = `${initialLeft + dx}px`;
    panel.style.top = `${initialTop + dy}px`;
  });

  document.addEventListener('mouseup', () => { 
    if (!isDragging) return; 
    isDragging = false; 
    document.body.style.userSelect = '';
    const overlay = panel.querySelector('#drag-overlay');
    if (overlay) overlay.remove();
  });
}

// 監聽 Background 來的指令
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;

  switch (msg.action) {
    case 'show-meeting-panel':
      // 如果有 meetingId -> 進入該會議的 Run Mode
      // 如果沒有 (null) -> 進入首頁，讓使用者選擇建立或加入
      const targetRoute = msg.meetingId 
        ? `/meetings/${msg.meetingId}/run` 
        : '/';
      
      createPanel(targetRoute);
      sendResponse({ ok: true });
      break;

    case 'hide-meeting-panel':
    case 'hide-brainstorm-panel':
      removePanel();
      sendResponse({ ok: true });
      break;
  }
});