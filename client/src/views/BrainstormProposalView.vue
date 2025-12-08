<template>
  <div class="page">
    <h2>{{ brainstorming.topic }}</h2>

    <p>剩餘時間：<strong>{{ countdown }}</strong> 秒</p>

    <textarea 
      v-model="newIdea"
      placeholder="輸入想法（Enter 送出）"
      @keydown.enter.exact.prevent="submitIdea"
    ></textarea>

    <button @click="submitIdea">送出想法</button>

    <ul class="idea-list">
      <li v-for="idea in ideas" :key="idea.id">
        {{ idea.idea }}
      </li>
    </ul>
  </div>
</template>


<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { io } from "socket.io-client";

const route = useRoute();
const router = useRouter();
const meetingId = route.params.id;

const API_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const brainstorming = ref({});
const ideas = ref([]);
const countdown = ref(0);
const newIdea = ref("");

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
    userId: localStorage.getItem("userId"),
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
