<template>
  <div class="auth-container">
    <div class="auth-card">
      <div class="header">
        <h1>Meeting AI</h1>
        <p class="subtitle">您的智慧會議助手</p>
      </div>

      <div class="auth-form">
        <button @click="startGoogleLogin" class="google-login-btn" :disabled="isLoading">
          <span v-if="!isLoading">🔐 使用 Google 帳號登入</span>
          <span v-else>
            <span class="spinner"></span>
            登入中...
          </span>
        </button>
        
        <div v-if="error" class="error-box">
          {{ error }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { getAPIBase, getGoogleClientID } from '../utils/apiClient';

const router = useRouter();
const isLoading = ref(false);
const error = ref('');

// 等待 postMessage 的 Promise
const waitForAuthMessage = (): Promise<any> => {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      
      // 驗證數據結構
      if (data && (data.success !== undefined || data.error)) {
        window.removeEventListener('message', handler);
        resolve(data);
      }
    };
    
    window.addEventListener('message', handler);
    
    // 30秒超時
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ error: '登入超時' });
    }, 30000);
  });
};

const startGoogleLogin = async () => {
  isLoading.value = true;
  error.value = '';
  
  try {
    const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || getGoogleClientID();
    const backendUrl = getAPIBase();
    const redirectUri = `${backendUrl}/api/users/auth/google/callback`;
    
    if (!clientId) {
      throw new Error('Google Client ID 未設定');
    }
    
    // 生成隨機 state
    const state = Math.random().toString(36).substring(7);
    localStorage.setItem('oauth_state', state);
    
    // 構造 Google OAuth 授權 URL
    // Scope 需要用空格分隔，不能放在 URLSearchParams 中（會被編碼）
    const scopes = [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar'
    ].join(' ');
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline', // 請求 refresh token
      prompt: 'consent', // 強制顯示授權畫面以獲取 refresh token
      state: state
    });
    
    // 手動添加 scope（因為 URLSearchParams 會編碼空格）
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}&scope=${encodeURIComponent(scopes)}`;
    
    // 開啟 OAuth 授權視窗
    const width = 500;
    const height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    
    const authWindow = window.open(
      authUrl,
      'google_oauth',
      `width=${width},height=${height},left=${left},top=${top},resizable,scrollbars`
    );
    
    if (!authWindow) {
      throw new Error('無法開啟授權視窗，請檢查瀏覽器設定');
    }
    
    // 等待認証結果
    const result = await waitForAuthMessage();
    
    if (result.success) {
      // 登入成功
      localStorage.setItem('meeting_user_id', result.user_id);
      localStorage.setItem('meeting_user_email', result.email);
      // 儲存 username（若後端有回傳）以避免使用舊資料
      if (result.username) {
        localStorage.setItem('meeting_user_name', result.username);
      }
      
      // 導向會議列表
      router.push('/meetings');
    } else {
      // 登入失敗
      error.value = `登入失敗: ${result.error || '未知錯誤'}`;
    }
    
  } catch (err: any) {
    console.error('OAuth 登入錯誤:', err);
    error.value = err.message;
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  // 檢查是否已登入
  const userId = localStorage.getItem('meeting_user_id');
  if (userId) {
    router.push('/meetings');
  }
});
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

/* 表單樣式 */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Google 登入按鈕 */
.google-login-btn {
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
  gap: 8px;
}

.google-login-btn:hover:not(:disabled) {
  background: #0842a0;
}

.google-login-btn:disabled {
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
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
