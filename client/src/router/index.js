import { createRouter, createWebHashHistory } from "vue-router";

// 引入 LoginView (請確認你的檔案路徑正確)
import LoginView from "../views/LoginView.vue"; 
import MeetingListView from "../views/MeetingListView.vue";
import MeetingAgendaView from "../views/MeetingAgendaView.vue";
import BrainstormView from "../views/BrainstormView.vue";
import SettingsView from "../views/SettingsView.vue";
import HelpView from "../views/HelpView.vue";
import MeetingRunView from "../views/MeetingRunView.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 預設路徑：這裡設為導向 /meetings，
    // 但下方的 router.beforeEach 會攔截，若沒登入會自動轉去 /login
    { path: "/", redirect: "/meetings" },

    // 登入頁面
    { 
      path: "/login", 
      name: "Login", 
      component: LoginView 
    },

    // --- 以下為需要登入才能看到的頁面 (加上 meta: { requiresAuth: true }) ---

    { 
      path: "/meetings", 
      component: MeetingListView, 
      meta: { requiresAuth: true } 
    },
    { 
      path: "/meetings/:id", 
      component: MeetingAgendaView,
      meta: { requiresAuth: true } 
    },
    { 
      path: "/meetings/:id/run", 
      component: MeetingRunView,
      meta: { requiresAuth: true } 
    },
    { 
      path: "/meetings/:id/brainstorm", 
      component: BrainstormView,
      meta: { requiresAuth: true } 
    },
    { 
      path: "/settings", 
      component: SettingsView,
      meta: { requiresAuth: true } 
    },
    { 
      path: "/help", 
      component: HelpView,
      meta: { requiresAuth: true } 
    },
    {
      path: "/meetings/:id/summary",
      name: "SummaryView",
      component: () => import("../views/SummaryView.vue"),
      meta: { requiresAuth: true } 
    },
  ],
});

// ⭐ 全域路由守衛 (Navigation Guard)
router.beforeEach((to, from, next) => {
  // 檢查是否有 User ID (視為已登入)
  const isAuthenticated = localStorage.getItem("meeting_user_id");

  // 1. 如果要去「需要權限」的頁面，且「未登入」 -> 踢回登入頁
  if (to.meta.requiresAuth && !isAuthenticated) {
    next("/login");
  } 
  // 2. 如果已經登入，還想去「登入頁」 -> 直接轉去會議列表 (不用再登入了)
  else if (to.path === "/login" && isAuthenticated) {
    next("/meetings");
  } 
  // 3. 其他狀況 -> 放行
  else {
    next();
  }
});

export default router;