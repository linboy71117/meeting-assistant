<template>
  <div class="page brainstorm-complete">
    <div v-if="loading" class="loading-state">
      <p>正在載入腦力激盪結果...</p>
    </div>

    <div v-else-if="!brainstorming.topic" class="error-state">
      <h2>⚠️ 找不到腦力激盪結果</h2>
      <p v-if="error">{{ error }}</p>
      <p v-else>本次會議似乎沒有完成的腦力激盪活動。</p>
      <button @click="$router.back()" class="primary-btn">返回上一頁</button>
    </div>

    <div v-else>
      <h2 class="title">腦力激盪：{{ brainstorming.topic }}</h2>
      <div class="meta-info">
        <p>
          建立時間：
          <strong>{{ formatDateTime(brainstorming.created_at) }}</strong>
        </p>
        <p>
          預計結束時間：
          <strong>{{ formatDateTime(brainstorming.expires_at) }}</strong>
        </p>
        </div>

      <hr />

      <h3 class="section-title">🤖 AI 腦力激盪總結</h3>
      <div v-if="isAiSummaryComplete" class="ai-summary-box">
        <p class="ai-summary-text">{{ aiSummary }}</p>
      </div>
      <div v-else-if="aiSummary === AI_STATUS_PROCESSING" class="ai-loading-state processing">
        <p class="loading-text">
          AI 正在分析想法並生成總結中...
          <span class="spinner">🧠</span>
        </p>
        <p class="small-text">（本頁面會自動透過 Socket.IO 更新）</p>
      </div>
      <div v-else-if="ideas.length > 0" class="ai-loading-state">
         <p class="loading-text">
          等待 AI 分析開始...（若長時間無反應，請檢查後端日誌）
        </p>
      </div>
      <div v-else class="ai-loading-state empty-ideas">
        <p>本次腦力激盪沒有收集到任何想法，跳過 AI 總結。</p>
      </div>
      
      <hr />


      <h3 class="section-title">✨ 總結想法 ({{ ideas.length }} 則)</h3>

      <ul v-if="ideas.length" class="idea-list">
        <li v-for="(idea, index) in ideas" :key="idea.id" class="idea-item">
          <div class="idea-number">#{{ index + 1 }}</div>
          
          <div class="content-wrapper">
            <p class="idea-text">{{ idea.idea }}</p>
            <p class="idea-meta">
              提出者：{{ idea.user_id || '匿名' }} | 
              時間：{{ formatTime(idea.created_at) }}
            </p>
          </div>
          
        </li>
      </ul>

      <p v-else class="empty-list">本次腦力激盪沒有收集到任何想法。</p>

      <div class="actions">
        <button @click="$router.push(`/meetings/${meetingId}`)" class="primary-btn">
          回到會議詳情
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
// 💡 引入 Socket.IO Client
import { io } from "socket.io-client"; 

const API_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
const route = useRoute();
const router = useRouter();
const meetingId = route.params.id;

// 💡 定義與後端一致的狀態標記
const AI_STATUS_PROCESSING = 'PROCESSING...'; 

const brainstorming = ref({});
const ideas = ref([]);
const loading = ref(true);
const error = ref(null);
// 💡 新增 AI 總結狀態，預設為 null (未啟動或未完成)
const aiSummary = ref(null); 
let socket = null;

// 💡 Computed property 檢查是否為最終總結
const isAiSummaryComplete = computed(() => {
    // 總結存在且不等於 PROCESSING 狀態
    return aiSummary.value && aiSummary.value !== AI_STATUS_PROCESSING;
});

// --------------------------
// Socket.IO 連線與監聽
// --------------------------
function connectSocket() {
    // 只有在還沒有最終總結時才需要連線
    if (socket || isAiSummaryComplete.value) return; 

    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_BASE;
    // 假設 Socket.IO 服務與 API 同源
    socket = io(SOCKET_URL); 

    // 加入會議室，以便接收通知
    socket.emit("join-meeting", meetingId); 
    console.log(`Frontend joined meeting-${meetingId} socket room for AI status.`);

    // 💡 監聽 AI 總結完成事件 (事件名稱來自 brainstorming.js)
    socket.on("ai-analysis-completed", (payload) => {
        if (payload.meetingId === meetingId) {
            console.log("AI analysis received via Socket.IO. Updating view.");
            aiSummary.value = payload.ai_summary; // 更新頁面狀態
            disconnectSocket(); // 接收到結果後即可斷線
        }
    });
}

function disconnectSocket() {
    if (socket) {
        // 離開會議室
        socket.emit("leave-meeting", meetingId); 
        socket.disconnect();
        socket = null;
        console.log(`Frontend left meeting-${meetingId} socket room.`);
    }
}

// --------------------------
// 取得腦力激盪結果資料
// --------------------------
async function fetchBrainstormingResults() {
  loading.value = true;
  error.value = null;

  try {
    const res = await fetch(`${API_BASE}/api/brainstorming/${meetingId}/complete`);

    if (!res.ok) {
      const err = await res.json();
      error.value = err.error || `伺服器錯誤: ${res.status}`;
      brainstorming.value = {}; 
      return;
    }

    const data = await res.json();
    brainstorming.value = data.brainstorming;
    ideas.value = data.ideas;
    
    // 💡 取得 AI 總結狀態
    // 狀態可能為 NULL, 'PROCESSING...', 或最終的總結文字 (來自後端)
    aiSummary.value = data.brainstorming.ai_summary;

    // 💡 如果狀態是 null (未啟動) 或 PROCESSING (已啟動但未完成)，且有想法，則連接 Socket
    if (!isAiSummaryComplete.value && ideas.value.length > 0) {
        connectSocket();
    }

  } catch (err) {
    console.error("Network or parsing error:", err);
    error.value = "連線失敗或資料格式錯誤。";
  } finally {
    loading.value = false;
  }
}

// --------------------------
// 輔助函式：格式化日期時間
// --------------------------
function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}


onMounted(() => {
  fetchBrainstormingResults();
});

// 💡 組件銷毀時，斷開 Socket 連線
onUnmounted(() => {
    disconnectSocket();
});
</script>

<style scoped>
.brainstorm-complete {
  max-width: 800px;
  margin: 0 auto;
  padding: 30px;
  background-color: #f9f9f9;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.title {
  color: #333;
  margin-bottom: 10px;
}

.meta-info p {
  font-size: 14px;
  color: #666;
  margin-bottom: 5px;
}

.section-title {
  margin-top: 20px;
  margin-bottom: 15px;
  color: #007bff;
  border-bottom: 2px solid #007bff;
  padding-bottom: 5px;
}

/* 💡 新增 AI 總結區域樣式 */
.ai-summary-box {
    padding: 15px;
    background-color: #e6f7ff; 
    border-radius: 8px;
    border: 1px solid #91d5ff;
}

.ai-summary-text {
    color: #1a5c88;
    margin: 0;
    line-height: 1.6;
    white-space: pre-wrap; /* 保持 AI 輸出的換行和格式 */
}

.ai-loading-state {
    padding: 20px;
    text-align: center;
    background-color: #fffbe6; 
    border: 1px dashed #ffe58f;
    border-radius: 8px;
    color: #a87e00;
}

.ai-loading-state.processing {
    background-color: #e6e6ff; /* 處理中的顏色 */
    border-color: #b3b3ff;
    color: #333366;
}

.ai-loading-state .small-text {
    font-size: 0.9em;
    color: #666;
    margin-top: 10px;
}

.ai-loading-state.empty-ideas {
    background-color: #f0f0f0;
    border-color: #ccc;
    color: #666;
}

.loading-text {
    margin: 0;
    font-style: italic;
}

/* 簡易旋轉動畫 */
.spinner {
    display: inline-block;
    animation: spin 1s linear infinite;
    font-size: 1.2em;
    margin-left: 5px;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

/* 保持原有的想法列表樣式 */
.idea-list {
  list-style: none;
  padding: 0;
}

.idea-item {
  display: flex; /* 保持 flex，讓 idea-number 和 content-wrapper 並排 */
  align-items: flex-start;
  padding: 15px;
  margin-bottom: 10px;
  background-color: #fff;
  border-left: 5px solid #007bff;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.idea-number {
  font-size: 1.5em;
  font-weight: bold;
  color: #007bff;
  margin-right: 15px;
  padding-top: 2px;
  /* 確保編號不被壓縮 */
  flex-shrink: 0; 
}

/* 新增 content-wrapper 樣式 */
.content-wrapper {
  /* 讓這個容器佔用 idea-item 內剩餘的所有空間 */
  flex-grow: 1; 
  /* 移除 idea-text 原本在 idea-item 中設定的 margin */
  margin: 0; 
}

.idea-text {
  /* 確保文字填滿空間 */
  width: 100%; 
  font-size: 12px;
  /* 移除 idea-text 原本在 idea-item 中設定的 flex-grow: 1; */
  margin: 0; 
  line-height: 1.5;
}

.idea-meta {
  font-size: 8px;
  color: #999;
  /* 調整上邊距 */
  margin-top: 5px; 
  /* 移除左邊距和 flex 相關設定 */
  margin-left: 0; 
  /* 確保資訊靠右對齊 */
  text-align: right; 
}

.actions {
  margin-top: 30px;
  text-align: center;
}

.primary-btn {
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>