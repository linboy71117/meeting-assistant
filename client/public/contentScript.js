// client/public/contentScript.js
(function () {
  // 避免同一個頁面重複插入
  if (document.getElementById("ai-brainstorm-panel")) return;

  const panel = document.createElement("div");
  panel.id = "ai-brainstorm-panel";

  panel.innerHTML = `
    <div class="ai-bs-header">
      <span>AI Meeting Assistant · Brainstorm</span>
      <button id="ai-bs-close">×</button>
    </div>
    <iframe id="ai-bs-iframe" frameborder="0"></iframe>
  `;

  document.body.appendChild(panel);

  // 這裡先固定用「會議 #1」做 prototype
  const iframe = panel.querySelector("#ai-bs-iframe");
  iframe.src = chrome.runtime.getURL("index.html#/meetings/1/brainstorm");

  // 關閉按鈕
  panel.querySelector("#ai-bs-close").addEventListener("click", () => {
    panel.remove();
  });

  // 簡單「拖曳」效果：按著 header 可以拖動
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const header = panel.querySelector(".ai-bs-header");
  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    panel.style.left = `${startLeft + dx}px`;
    panel.style.top = `${startTop + dy}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = "";
  });
})();
