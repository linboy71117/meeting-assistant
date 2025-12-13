<template>
  <!-- <div>
    <h2>Settings</h2>
    <p>未來可以放語言、AI API Key、清除資料等設定。</p>
  </div> -->
  <div class="page-container">
    
    <div class="header">
      <button class="back-btn" @click="$router.push('/meetings')">
        ← 返回列表
      </button>
      <h2 class="title">設定 (Settings)</h2>
    </div>

    <div class="profile-card">
      <div class="avatar">
        {{ userInitials }}
      </div>
      <div class="info">
        <div class="name-row">
          <h3 class="name">{{ userName || '未命名使用者' }}</h3>
        </div>
        <p class="email">{{ userEmail }}</p>
      </div>
    </div>

    <div class="menu-list">
      <div class="menu-item">
        <span class="label">應用程式版本</span>
        <span class="value">v1.0.0</span>
      </div>
      <div class="menu-item">
        <span class="label">介面語言</span>
        <span class="value">繁體中文</span>
      </div>
    </div>

    <button class="btn-logout" @click="handleLogout">
      登出 (Log Out)
    </button>

  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const API_BASE = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:3000';
const userId = ref('');
const userName = ref('');
const userEmail = ref('');

// 取得使用者名稱縮寫 (例如 "Alex Chen" -> "AC")
const userInitials = computed(() => {
  if (!userName.value) return '?';
  return userName.value
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
});

onMounted(() => {
  // 從 LocalStorage 讀取資料顯示（由 OAuth callback 或先前登入設定）
  const storedId = localStorage.getItem('meeting_user_id');
  userId.value = storedId ? storedId : '';
  userName.value = localStorage.getItem('meeting_user_name') || '';
  userEmail.value = localStorage.getItem('meeting_user_email') || '';
});

function handleLogout() {
  if (!confirm('確定要登出嗎？')) return;

  // 1. 清除所有相關的 LocalStorage
  localStorage.removeItem('meeting_user_id');
  localStorage.removeItem('meeting_user_name');
  localStorage.removeItem('meeting_user_email');
  
  // 2. 跳轉回登入頁
  router.push('/login');
}
</script>

<style scoped>
.page-container {
  padding: 16px;
  width: 100%;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* Settings: local input/button */
.input-field {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
}
.name-row { display:flex; gap:8px; align-items:center; }

.header {
  margin-bottom: 24px;
}

.back-btn {
  background: none;
  border: none;
  color: #0b57d0;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  margin-bottom: 8px;
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  color: #1f2937;
}

/* 個人資料卡片 */
.profile-card {
  background: white;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  margin-bottom: 24px;
  border: 1px solid #eee;
}

.avatar {
  width: 60px;
  height: 60px;
  background: #0b57d0;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
}

.info {
  flex: 1;
  overflow: hidden;
}

.name {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: #111;
}

.email {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: #666;
}

.uid {
  margin: 0;
  font-size: 11px;
  color: #999;
  font-family: monospace;
}

/* 選單列表 */
.menu-list {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 24px;
  border: 1px solid #eee;
}

.menu-item {
  display: flex;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}

.menu-item:last-child {
  border-bottom: none;
}

.label {
  color: #333;
}

.value {
  color: #666;
}

/* 登出按鈕 */
.btn-logout {
  width: 100%;
  padding: 14px;
  background: #fee2e2;
  color: #dc2626;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-logout:hover {
  background: #fecaca;
}
</style>
