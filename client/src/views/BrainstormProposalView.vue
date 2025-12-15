<template>
  <div class="page brainstorm-proposal-container">
    <header class="header-section">
      <h2 class="topic-title">{{ brainstorming.topic }}</h2>

      <div :class="['countdown-badge', { 'is-urgent': countdown <= 60 }]">
        ⏳ 剩餘時間：<strong>{{ formattedCountdown }}</strong>
      </div>
    </header>

    <main class="main-content">
      <section class="idea-input-section">
        <textarea 
          v-model="newIdea"
          placeholder="輸入您的想法，越快越好！（按下 Enter 鍵送出）"
          @keydown.enter.exact.prevent="submitIdea"
        ></textarea>
        <button @click="submitIdea" class="submit-btn" :disabled="!newIdea.trim()">
          ✨ 送出想法 ({{ newIdea.length }} / 200)
        </button>
      </section>

      <section class="idea-list-section" v-if="ideas.length > 0">
        <h3>目前已收集的想法 ({{ ideas.length }} 則)</h3>
        
        <ul class="idea-list">
          <li v-for="(idea, index) in ideas" :key="idea.id" class="idea-item">
            <span class="idea-number">#{{ index + 1 }}</span>
            <p class="idea-text">{{ idea.idea }}</p>
          </li>
        </ul>
      </section>
      
      <section v-else class="no-ideas-section">
      </section>
    </main>

  </div>
</template>


<script setup>
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { io } from "socket.io-client";

const route = useRoute();
const router = useRouter();
const meetingId = route.params.id;

const API_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const brainstorming = ref({});
const ideas = ref([]);
const countdown = ref(0);
const newIdea = ref("AI 會議助理");

let timer = null;
let socket;


// ---------------------------
// 取得腦力激盪資料
// ---------------------------
async function loadBrainstorming() {
  // 1. 呼叫專門用來檢查「活動中」狀態的 API
  const resActive = await fetch(`${API_BASE}/api/brainstorming/${meetingId}/active`);
  
  if (!resActive.ok) {
    // 如果 API 回傳 404 (表示找不到活動中或已過期)
    const err = await resActive.json();
    console.error("無法載入活動中的腦力激盪:", err.error);
    
    // 導向完成頁或會議詳情頁
    router.replace(`/meetings/${meetingId}`); 
    return;
  }

  const activeData = await resActive.json();
  
  // 2. 更新狀態：主題和到期時間
  // 注意：我們只取得主題和到期時間，ideas 可能需要另一個 API 取得
  brainstorming.value = activeData; // { id, topic, expires_at }
  
  // 4. 開始倒數計時
  startCountdown(brainstorming.value.expires_at);
}

// ---------------------------
// 倒數計時
// ---------------------------
function startCountdown(expires) {
  const end = new Date(expires).getTime();

  timer = setInterval(() => {
    const remain = Math.floor((end - Date.now()) / 1000);
    countdown.value = remain;

    if (remain <= 0) {
      clearInterval(timer);
      router.push(`/meetings/${meetingId}/brainstorm/complete`);
    }
  }, 1000);
}


// ---------------------------
// 送出想法（改成 fetch）
// ---------------------------
async function submitIdea() {
  if (!newIdea.value.trim()) return;

  const payload = {
    userId: localStorage.getItem("meeting_user_name"),
    idea: newIdea.value.trim(),
  };

  const res = await fetch(`${API_BASE}/api/brainstorming/${meetingId}/ideas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("Failed to submit idea");
    return;
  }

  newIdea.value = "";
}

const formattedCountdown = computed(() => {
  const totalSeconds = countdown.value;
  
  // 計算分鐘數 (MM)
  const minutes = Math.floor(totalSeconds / 60);
  
  // 計算剩餘秒數 (SS)
  const seconds = totalSeconds % 60;
  
  // 使用 padStart 確保總是兩位數 (例如：5 變成 05)
  const formattedMinutes = String(minutes).padStart(2, '0');
  const formattedSeconds = String(seconds).padStart(2, '0');
  
  return `${formattedMinutes}:${formattedSeconds}`;
});


// ---------------------------
// 初始化
// ---------------------------
onMounted(async () => {
  await loadBrainstorming();

  const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_BASE;
  socket = io(SOCKET_URL);

  socket.on("new-brainstorming-idea", (idea) => {
    ideas.value.push(idea);
  });
});
</script>


<style scoped>
/* 容器 */
.brainstorm-proposal-container {
  max-width: 800px;
  margin: 30px auto;
  padding: 30px;
  background-color: #f4f7f6;
  border-radius: 12px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 標頭區塊 */
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #e0e6e9;
  padding-bottom: 15px;
}

.topic-title {
  color: #2c3e50;
  font-size: 1.8em;
  margin: 0;
}

/* 計時器徽章 */
.countdown-badge {
  background-color: #3498db; /* 藍色 */
  color: white;
  padding: 8px 15px;
  border-radius: 20px;
  font-weight: 500;
  font-size: 1em;
  transition: background-color 0.3s;
}

.countdown-badge.is-urgent {
  background-color: #e74c3c; /* 紅色，剩餘時間少於 60 秒時 */
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

/* 想法輸入區塊 */
.idea-input-section {
  background-color: #ffffff;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

textarea {
  width: 100%;
  min-height: 120px;
  padding: 15px;
  border: 1px solid #bdc3c7;
  border-radius: 8px;
  resize: vertical;
  font-size: 16px;
  margin-bottom: 10px;
  box-sizing: border-box;
  transition: border-color 0.3s;
}

textarea:focus {
  border-color: #3498db;
  outline: none;
}

.submit-btn {
  width: 100%;
  padding: 12px;
  background-color: #f39c12; /* 黃色/橙色，強調「提交」 */
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1em;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s;
}

.submit-btn:hover {
  background-color: #e67e22;
}

/* 想法列表區塊 */
.idea-list-section h3 {
  color: #34495e;
  margin-bottom: 15px;
  border-left: 4px solid #3498db;
  padding-left: 10px;
}

.idea-list {
  list-style: none;
  padding: 0;
  /* 列表最大高度，讓其可滾動 */
  max-height: 400px; 
  overflow-y: auto;
  margin-top: 15px;
  /* 美化滾動條，但瀏覽器支援度不一 */
  scrollbar-width: thin; 
  scrollbar-color: #3498db #f4f7f6;
}

.idea-item {
  display: flex;
  align-items: flex-start;
  padding: 15px;
  margin-bottom: 10px;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border-left: 5px solid #2ecc71; /* 綠色左邊線 */
  transition: transform 0.2s;
}

.idea-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.idea-number {
  background-color: #3498db;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.9em;
  margin-right: 15px;
  flex-shrink: 0; /* 確保編號不會被壓縮 */
}

.idea-text {
  margin: 0;
  color: #34495e;
  line-height: 1.6;
}
</style>
