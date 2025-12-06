<template>
  <div class="auth-container">
    <div class="auth-card">
      <div class="header">
        <h1>Meeting AI</h1>
        <p class="subtitle">您的智慧會議助手</p>
      </div>

      <div class="tabs">
        <button 
          :class="['tab-btn', { active: !isRegister }]" 
          @click="toggleMode(false)"
        >
          登入
        </button>
        <button 
          :class="['tab-btn', { active: isRegister }]" 
          @click="toggleMode(true)"
        >
          註冊新帳號
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="auth-form">
        
        <div v-if="isRegister" class="form-group slide-in">
          <label for="name">您的稱呼 (Name)</label>
          <input 
            id="name"
            v-model="form.name" 
            type="text" 
            placeholder="例如: Alex Chen"
            required
          />
        </div>

        <div class="form-group">
          <label for="email">電子信箱 (Email)</label>
          <input 
            id="email"
            v-model="form.email" 
            type="email" 
            placeholder="name@example.com"
            required
          />
        </div>

        <div v-if="errorMsg" class="error-box">
          {{ errorMsg }}
        </div>

        <button type="submit" class="submit-btn" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          <span v-else>{{ isRegister ? '立即註冊' : '進入系統' }}</span>
        </button>

      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const API_BASE = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:3000";

// 狀態
const isRegister = ref(false); // 預設為登入模式
const loading = ref(false);
const errorMsg = ref('');

const form = reactive({
  name: '',
  email: ''
});

// 切換模式時清空錯誤
function toggleMode(registerMode: boolean) {
  isRegister.value = registerMode;
  errorMsg.value = '';
}

async function handleSubmit() {
  loading.value = true;
  errorMsg.value = '';

  try {
    const endpoint = isRegister.value ? '/api/users/register' : '/api/users/login';
    
    // 根據模式準備 Payload
    // 註冊需要 name + email，登入只需要 email
    const payload = isRegister.value 
      ? { name: form.name, email: form.email }
      : { email: form.email };

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      // 處理後端回傳的錯誤 (例如: "用戶不存在" 或 "Email 已被註冊")
      throw new Error(data.error || '請求失敗');
    }

    // 登入/註冊成功
    // 1. 儲存 User ID 到 LocalStorage (這是整個 App 辨識身份的關鍵)
    localStorage.setItem('meeting_user_id', data.id);
    localStorage.setItem('meeting_user_name', data.name);
    localStorage.setItem('meeting_user_email', data.email);

    // 2. 跳轉到會議列表 (創建會議頁面)
    router.push('/meetings');

  } catch (err: any) {
    console.error(err);
    errorMsg.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* 整體容器：置中 + 漸層背景 */
.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  padding: 20px;
}

/* 卡片本體 */
.auth-card {
  background: white;
  width: 100%;
  max-width: 400px;
  padding: 40px;
  border-radius: 20px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  transition: all 0.3s ease;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h1 {
  margin: 0;
  font-size: 28px;
  color: #2c3e50;
  font-weight: 800;
}

.subtitle {
  margin: 5px 0 0;
  color: #7f8c8d;
  font-size: 14px;
}

/* 切換按鈕區 */
.tabs {
  display: flex;
  background: #f1f3f5;
  padding: 4px;
  border-radius: 12px;
  margin-bottom: 24px;
}

.tab-btn {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  color: #7f8c8d;
  font-weight: 600;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.tab-btn.active {
  background: white;
  color: #0b57d0;
  box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}

/* 表單樣式 */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: #34495e;
}

.form-group input {
  padding: 12px 14px;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  font-size: 15px;
  transition: border-color 0.2s;
  background: #fdfdfd;
}

.form-group input:focus {
  outline: none;
  border-color: #0b57d0;
  background: white;
}

/* 按鈕樣式 */
.submit-btn {
  margin-top: 10px;
  background: #0b57d0;
  color: white;
  border: none;
  padding: 14px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
}

.submit-btn:hover:not(:disabled) {
  background: #0842a0;
}

.submit-btn:disabled {
  background: #a0c3ff;
  cursor: not-allowed;
}

/* 錯誤訊息 */
.error-box {
  background: #fee2e2;
  color: #dc2626;
  padding: 10px;
  border-radius: 8px;
  font-size: 13px;
  text-align: center;
}

/* Loading 動畫 */
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 簡單的淡入動畫 */
.slide-in {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>