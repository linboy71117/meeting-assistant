import { io } from "socket.io-client";

// 你的後端網址
const URL = (import.meta.env.VITE_BACKEND_URL) || "http://localhost:3000";

// 建立連線實例
const socket = io(URL, {
  autoConnect: false, // 建議設為 false，等我們需要時再手動 socket.connect()
  transports: ["websocket"], // 強制使用 WebSocket 協定，效能較好
});

// 方便 Debug：監聽連線狀態
socket.on("connect", () => {
  console.log("✅ [Frontend] Socket connected:", socket.id);
});

socket.on("disconnect", () => {
  console.log("❌ [Frontend] Socket disconnected");
});

socket.on("connect_error", (err) => {
  console.error("⚠️ [Frontend] Connection error:", err.message);
});



export default socket;