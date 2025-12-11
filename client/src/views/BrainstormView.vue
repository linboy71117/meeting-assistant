<template>
  <div class="page brainstorm-view-container">
    <h2 class="page-title">創建腦力激盪</h2>

    <div class="form-group">
      <label for="topic">主題：</label>
      <input 
        id="topic"
        v-model="topic" 
        placeholder="請輸入主題（例如：HCI 專案提案）"
      />
    </div>

    <div class="form-group">
      <label for="duration">持續時間 (分鐘)：</label>
      <input 
        id="duration"
        type="number" 
        v-model="duration" 
        min="1" 
        max="60"
        placeholder="建議 5-10 分鐘"
      />
    </div>

    <button @click="createBrainstorm" class="primary-btn">
      🚀 開始腦力激盪
    </button>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const API_BASE =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

const route = useRoute();
const router = useRouter();

const meetingId = route.params.id;

const topic = ref("HCI 專案提案");
const duration = ref(1);

async function createBrainstorm() {
  const payload = {
    meetingId,
    topic: topic.value,
    duration: Number(duration.value) * 60, // 轉換成秒數
  };

  try {
    const res = await fetch(`${API_BASE}/api/brainstorming`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      alert("建立腦力激盪失敗：" + err.error);
      router.replace(`/meetings/${meetingId}/brainstorm/proposal`);
      return;
    }

    router.push(`/meetings/${meetingId}/brainstorm/proposal`);
  } catch (err) {
    console.error(err);
    alert("伺服器連線失敗");
  }
}
</script>

<style scoped>
.brainstorm-view-container {
  max-width: 500px;
  margin: 40px auto;
  padding: 30px;
  background-color: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.page-title {
  color: #2c3e50;
  border-bottom: 2px solid #3498db;
  padding-bottom: 10px;
  margin-bottom: 30px;
  text-align: center;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  font-weight: bold;
  margin-bottom: 8px;
  color: #34495e;
  font-size: 1.1em;
}

input[type="text"],
input[type="number"] {
  width: 100%;
  padding: 12px;
  border: 1px solid #bdc3c7;
  border-radius: 8px;
  box-sizing: border-box;
  font-size: 16px;
  transition: border-color 0.3s;
}

input:focus {
  border-color: #3498db;
  outline: none;
  box-shadow: 0 0 5px rgba(52, 152, 219, 0.3);
}

.primary-btn {
  width: 100%;
  padding: 15px;
  background-color: #2ecc71; /* 綠色：強調「開始」動作 */
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1em;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s ease;
  margin-top: 20px;
}

.primary-btn:hover {
  background-color: #27ae60;
}
</style>