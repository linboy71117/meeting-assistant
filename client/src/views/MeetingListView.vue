<template>
  <div class="popup-container">

    <h1 class="app-title">AI Meeting Assistant</h1>

    <div class="tabs">
      <button class="tab active">Meetings</button>
      <button class="tab" @click="$router.push('/settings')">Settings</button>
    </div>

    <div class="action-area">
      <button class="btn-main-action" @click="showMenu = !showMenu">
        <span class="plus-icon">＋</span> 新增 / 加入會議
      </button>

      <div v-if="showMenu" class="click-mask" @click="showMenu = false"></div>

      <transition name="dropdown">
        <div v-if="showMenu" class="dropdown-menu">
          
          <button class="menu-item" @click="handleCreateAsHost">
            <span class="icon">📅</span>
            <span>建立新會議 (Create)</span>
          </button>

          <button class="menu-item" @click="handleJoinAsParticipant">
            <span class="icon">🔗</span>
            <span>使用邀請碼 (Join)</span>
          </button>

        </div>
      </transition>
    </div>

    <h3 class="section-title">我的會議列表</h3>

    <p v-if="loading" class="meta">載入中...</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <div v-else-if="!meetings.length" class="meta empty-state">
      目前還沒有會議，按上方按鈕開始。
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
          
          <span v-if="m.role === 'host'" class="role-badge host">Host</span>
          <span v-else class="role-badge guest">Guest</span>

          <button 
            v-if="m.role === 'host'" 
            class="btn-icon delete" 
            @click.stop="deleteMeeting(m.id, m.title)"
            title="刪除會議 (Delete)"
          >
            🗑️
          </button>

          <button 
            v-else 
            class="btn-icon leave" 
            @click.stop="leaveMeeting(m.id, m.title)"
            title="退出會議 (Leave)"
          >
            🚪
          </button>

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

const API_BASE = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:3000";
const router = useRouter();

const meetings = ref<any[]>([]);
const loading = ref(false);
const error = ref("");
const showMenu = ref(false);

function generateInviteCodeFromId(id: string): string {
  const base = id.replace(/-/g, "").slice(0, 10);
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
    router.push('/login');
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

async function handleCreateAsHost() {
  showMenu.value = false;
  const userId = localStorage.getItem("meeting_user_id");
  if (!userId) {
    alert("請先登入");
    router.push("/login");
    return;
  }
  loading.value = true;
  try {
    const id = crypto.randomUUID();
    const inviteCode = generateInviteCodeFromId(id);
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      title: "新的會議",
      inviteCode: inviteCode,
      userId: userId,
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
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "建立失敗");
    }
    const saved = await res.json();
    router.push(`/meetings/${saved.id}?new=1`);
  } catch (e: any) {
    console.error("Create meeting failed", e);
    alert(`建立會議失敗：${e.message}`);
    loading.value = false;
  }
}

async function handleJoinAsParticipant() {
  showMenu.value = false;
  const code = prompt("請輸入會議邀請碼 (Invite Code):");
  if (!code) return; 

  const userId = localStorage.getItem("meeting_user_id");
  if (!userId) {
    router.push("/login");
    return;
  }
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "加入失敗");

    alert(`成功加入會議：${data.title}`);
    await loadMeetings(); 

  } catch (e: any) {
    console.error("Join meeting failed", e);
    alert(e.message);
  } finally {
    loading.value = false;
  }
}

// Host 專用：刪除會議 (原本的)
async function deleteMeeting(meetingId: string, title: string) {
  if (!confirm(`確定要「刪除」會議「${title}」嗎？\n刪除後所有人都無法再存取此會議！`)) {
    return;
  }
  // ... (原本的 fetch DELETE /api/meetings/:id 邏輯保持不變) ...
  try {
    const res = await fetch(`${API_BASE}/api/meetings/${meetingId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("刪除失敗");
    meetings.value = meetings.value.filter(m => m.id !== meetingId);
  } catch (e: any) {
    alert(e.message);
  }
}

// Guest 專用：退出會議 (新增的)
async function leaveMeeting(meetingId: string, title: string) {
  const userId = localStorage.getItem("meeting_user_id");
  if (!userId) return;

  if (!confirm(`確定要「退出」會議「${title}」嗎？\n您之後需要重新輸入邀請碼才能加入。`)) {
    return;
  }

  try {
    // 呼叫剛剛在 users.js 新增的 API
    const res = await fetch(`${API_BASE}/api/users/${userId}/meetings/${meetingId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "退出失敗");
    }

    // 成功後，從前端列表移除該項目
    meetings.value = meetings.value.filter(m => m.id !== meetingId);
    
    // 重新排序 index
    meetings.value.forEach((m, idx) => m.index = idx + 1);

  } catch (e: any) {
    console.error("Leave failed", e);
    alert(`退出失敗：${e.message}`);
  }
}

onMounted(loadMeetings);
</script>

<style scoped>
/* Container Layout */
.popup-container {
  width: 100%;
  max-width: 100% !important;
  padding: 14px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, system-ui;
  padding-bottom: 80px;
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
  margin-bottom: 14px;
}

.tab {
  flex: 1;
  padding: 6px 0;
  border-radius: 20px;
  font-size: 13px;
  border: 1px solid #ddd;
  background: #f7f7f7;
  cursor: pointer;
}

.tab.active {
  background: #0b57d0;
  color: white;
  border: none;
}

/* === ⭐ 修改重點：Dropdown 樣式 === */

.action-area {
  position: relative; /* 關鍵：讓絕對定位的選單參考這個位置 */
  margin-bottom: 20px;
  z-index: 100; /* 確保選單蓋在列表上面 */
}

.btn-main-action {
  width: 100%;
  background: #0b57d0;
  color: white;
  border: none;
  padding: 12px 0;
  font-size: 15px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 10px rgba(11, 87, 208, 0.2);
  transition: background 0.2s;
  position: relative;
  z-index: 102; /* 按鈕層級要最高 */
}

.btn-main-action:hover {
  background: #0947a8;
}

/* 透明遮罩：點選單以外的地方關閉 */
.click-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 101; /* 介於按鈕和底層之間 */
  background: transparent;
}

/* 下拉選單本體 */
.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px); /* 距離按鈕下方 8px */
  left: 0;
  width: 100%;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
  padding: 8px;
  z-index: 103; /* 比按鈕更高，蓋在 mask 上 */
  transform-origin: top center;
}

.menu-item {
  width: 100%;
  background: white;
  border: none;
  padding: 12px 16px;
  text-align: left;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: background 0.2s;
}

.menu-item:hover {
  background: #f3f4f6;
  color: #0b57d0;
}

.menu-item .icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}

/* 下拉動畫 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* === 列表樣式 === */
.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #444;
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
  border: 1px solid transparent;
  transition: border-color 0.2s;
}

.meeting-card:hover {
  border-color: #0b57d0;
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
  color: #0b57d0;
}

.meeting-title {
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}

.empty-state {
  text-align: center;
  padding: 20px;
  background: #f9fafb;
  border-radius: 8px;
  color: #888;
}

.error {
  color: #dc2626;
  font-size: 12px;
  text-align: center;
}

.role-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}
.role-badge.host {
  background: #e0f2fe;
  color: #0369a1;
}
.role-badge.guest {
  background: #f3f4f6;
  color: #4b5563;
}
.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px; /* 圖示大一點 */
  padding: 4px 8px;
  border-radius: 4px;
  opacity: 0.6;
  transition: all 0.2s;
  margin-left: 4px;
}

/* 垃圾桶 (刪除) Hover */
.btn-icon.delete:hover {
  opacity: 1;
  background-color: #fee2e2; /* 紅色背景 */
  transform: scale(1.1);
}

/* 出口 (退出) Hover */
.btn-icon.leave:hover {
  opacity: 1;
  background-color: #f3f4f6; /* 灰色背景 */
  transform: scale(1.1);
}
</style>