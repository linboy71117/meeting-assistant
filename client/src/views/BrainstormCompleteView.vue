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

      <h3 class="section-title">✨ 總結想法 ({{ ideas.length }} 則)</h3>

      <ul v-if="ideas.length" class="idea-list">
        <li v-for="(idea, index) in ideas" :key="idea.id" class="idea-item">
          <div class="idea-number">#{{ index + 1 }}</div>
          <p class="idea-text">{{ idea.idea }}</p>
          <p class="idea-meta">
            提出者：{{ idea.user_id || '匿名' }} | 
            時間：{{ formatTime(idea.created_at) }}
          </p>
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
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

const API_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
const route = useRoute();
const router = useRouter();
const meetingId = route.params.id;

const brainstorming = ref({});
const ideas = ref([]);
const loading = ref(true);
const error = ref(null);

// --------------------------
// 取得腦力激盪結果資料
// --------------------------
async function fetchBrainstormingResults() {
  loading.value = true;
  error.value = null;

  try {
    // 呼叫您提供的 API: /api/brainstormings/:meetingId/complete
    const res = await fetch(`${API_BASE}/api/brainstorming/${meetingId}/complete`);

    if (!res.ok) {
      // 處理 404 或其他 API 錯誤
      const err = await res.json();
      error.value = err.error || `伺服器錯誤: ${res.status}`;
      console.error("Failed to fetch brainstorming results:", err);
      brainstorming.value = {}; // 清空資料確保進入錯誤狀態
      return;
    }

    const data = await res.json();
    brainstorming.value = data.brainstorming;
    ideas.value = data.ideas;
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

.idea-list {
  list-style: none;
  padding: 0;
}

.idea-item {
  display: flex;
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
}

.idea-text {
  flex-grow: 1;
  font-size: 16px;
  margin: 0;
  line-height: 1.5;
}

.idea-meta {
  font-size: 12px;
  color: #999;
  margin-top: 5px;
  margin-left: 20px;
  flex-shrink: 0;
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