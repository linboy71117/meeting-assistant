<template>
  <div class="popup-container">

    <!-- Header -->
    <h1 class="app-title">AI Meeting Assistant</h1>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active">Meetings</button>
      <button class="tab">Settings</button>
    </div>

    <!-- Role Selector -->
    <div class="role-box">
      <label class="role-option">
        <input type="radio" v-model="role" value="host" />
        <span>我是主持人（Host）</span>
      </label>

      <label class="role-option">
        <input type="radio" v-model="role" value="participant" />
        <span>我是參與者（Participant）</span>
      </label>
    </div>

    <!-- Create Button -->
    <button class="btn-create" @click="createMeeting" :disabled="creating">
      <span v-if="creating">建立中...</span>
      <span v-else>建立新的會議（Create Meeting）</span>
    </button>

    <!-- Meeting List -->
    <h3 class="section-title">我建立的 / 加入的會議</h3>

    <p v-if="loading" class="meta">載入中...</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <div v-else-if="!meetings.length" class="meta">
      目前還沒有會議，按上方「建立新的會議」開始。
    </div>

    <div v-else class="meeting-list">
      <div
        class="meeting-card"
        v-for="m in meetings"
        :key="m.id"
        @click="router.push(`/meetings/${m.id}`)"
      >
        <div class="card-header">
          <span class="meeting-index">#{{ m.index }}</span>
          <span class="meeting-title">{{ m.title }}</span>
        </div>

        <div class="meta">📅 {{ m.date || '未設定日期' }}</div>
        <div class="meta">🔑 {{ m.inviteCode }}</div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";

const API_BASE =
  (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:3000";

const router = useRouter();

const role = ref("host");
const meetings = ref<any[]>([]);
const loading = ref(false);
const error = ref("");
const creating = ref(false);

// 簡單用 UUID 產生「abc-defg-hij」風格的 inviteCode
function generateInviteCodeFromId(id: string): string {
  const base = id.replace(/-/g, "").slice(0, 10); // 至少 10 chars
  const p1 = base.slice(0, 3);
  const p2 = base.slice(3, 7);
  const p3 = base.slice(7, 10);
  return [p1, p2, p3].filter(Boolean).join("-");
}

async function loadMeetings() {
  loading.value = true;
  error.value = "";

  const userId = localStorage.getItem("meeting_user_id");

  if (!userId) {
    error.value = "尚未登入，請先登入系統。";
    loading.value = false;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}/meetings`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    meetings.value = (data as any[]).map((m, idx) => ({
      ...m,
      index: idx + 1,
    }));
  } catch (e) {
    console.error("Failed to load meetings", e);
    error.value = "無法載入會議列表";
  } finally {
    loading.value = false;
  }
}

async function createMeeting() {
  creating.value = true;
  try {
    const userId = localStorage.getItem("meeting_user_id");
    
    if (!userId) {
      alert("無法識別使用者身分，請重新登入");
      router.push("/login");
      return;
    }

    const id = crypto.randomUUID();
    const inviteCode = generateInviteCodeFromId(id);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const payload = {
      // 後端 POST /api/meetings 需要的欄位
      title: "新的會議",
      inviteCode: inviteCode, // 必須是 CamelCase (inviteCode)
      userId: userId,         // 傳送 userId，讓後端把你加入為 host
      date: today,
      description: "",
      summary: "",
      agenda: [],

    };

    const res = await fetch(`${API_BASE}/api/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });


    const saved = await res.json();
    meetings.value.unshift({
      ...saved,
      index: meetings.value.length + 1,
    });

    if (!res.ok) {
      alert("建立會議失敗");
      return;
    }

    // 帶 new=1 進去，Detail 可以自動進「編輯模式」
    router.push(`/meetings/${saved.id}?new=1`);
  } catch (e) {
    console.error("Create meeting failed", e);
    alert("建立會議失敗（連線錯誤）");
  } finally {
    creating.value = false;
  }
}

onMounted(loadMeetings);
</script>

<style scoped>
/* ----------------------------
    For Popup Size Optimization
 -----------------------------*/

.popup-container {
  width: 100%;
  max-width: 100% !important;
  padding: 14px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, system-ui;
}

.app-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 10px;
  text-align: left;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.tab {
  flex: 1;
  padding: 5px 0;
  border-radius: 20px;
  font-size: 13px;
  border: 1px solid #ddd;
  background: #f7f7f7;
}

.tab.active {
  background: #0b57d0;
  color: white;
  border: none;
}

.role-box {
  background: white;
  padding: 10px;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 14px;
}

.role-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 6px;
}

.btn-create {
  width: 100%;
  background: #0b57d0;
  color: white;
  border: none;
  padding: 12px 0;
  font-size: 14px;
  border-radius: 10px;
  font-weight: 600;
  margin-bottom: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
}

.meeting-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meeting-card {
  background: white;
  border-radius: 10px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  cursor: pointer;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.meeting-index {
  font-weight: 700;
  font-size: 14px;
}

.meeting-title {
  font-size: 14px;
  font-weight: 600;
}

.meta {
  font-size: 12px;
  color: #555;
}

.error {
  font-size: 12px;
  color: #dc2626;
}
</style>
