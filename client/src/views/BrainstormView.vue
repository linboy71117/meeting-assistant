<template>
  <div class="page">
    <h2>創建腦力激盪</h2>

    <label>主題：</label>
    <input v-model="topic" placeholder="請輸入主題" />

    <label>持續分鐘數：</label>
    <input type="number" v-model="duration" />

    <button @click="createBrainstorm">開始腦力激盪</button>
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

const topic = ref("");
const duration = ref(5);

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

