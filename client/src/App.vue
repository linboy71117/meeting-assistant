<template>
  <div class="app-container">
    <!-- Wrapper for centered app content with shadow -->
    <div class="app-inner">
      <!-- Top Navigation Bar -->
      <header v-if="showTopNav" class="top-nav">
      <h1 class="app-title">AI Meeting Assistant</h1>

      <nav class="nav-tabs">
        <button
          :class="{ active: currentTab === 'meetings' }"
          @click="go('/meetings', 'meetings')"
        >
          Meetings
        </button>
        <button
          :class="{ active: currentTab === 'settings' }"
          @click="go('/settings', 'settings')"
        >
          Settings
        </button>
        <button
          :class="{ active: currentTab === 'help' }"
          @click="go('/help', 'help')"
        >
          ?
        </button>
      </nav>
    </header>

      <!-- Page Content -->
      <main class="content-area">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();

// which tab is selected
const currentTab = ref("meetings");

function go(path, tab) {
  currentTab.value = tab;
  router.push(path);
}

// 決定是否顯示頂部導航：Run 模式時隱藏
const showTopNav = computed(() => {
  const p = route.path || '';
  return !p.includes('/run');
});

// auto detect tab when user enters /meetings/:id
watch(
  () => route.path,
  (p) => {
    if (p.startsWith("/meetings")) currentTab.value = "meetings";
    else if (p.startsWith("/settings")) currentTab.value = "settings";
    else currentTab.value = "help";
  },
  { immediate: true }
);
</script>

<style scoped>
.app-container {
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #fafafa;
  font-family: "Inter", system-ui, sans-serif;
  padding-top: 50px;
}

/* ----- Header Navigation Bar ----- */
.top-nav {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 8px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  box-sizing: border-box;
}

.app-title {
  font-size: 15px;
  margin: 0;
  font-weight: 600;
  color: #111827;
}

/* ----- Tabs ----- */
.nav-tabs {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 6px;
}

.nav-tabs button {
  background: none;
  border: none;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
  color: #6b7280;
}

.nav-tabs button.active {
  background: #f97316;
  color: white;
  font-weight: 600;
}

/* ----- Main Content ----- */
.content-area {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  /* padding: 12px; */
}

.app-inner {
  width: 100%;
  max-width: 390px;
  box-sizing: border-box;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}
</style>
