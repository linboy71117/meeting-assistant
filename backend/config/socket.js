// config/socket.js - Socket.IO 設定

const { Server } = require("socket.io");

function setupSocketIO(httpServer, redis) {
  const io = new Server(httpServer, {
    cors: {
      origin: function (origin, callback) {
        if (!origin || origin.startsWith("chrome-extension://")) {
          callback(null, true);
        } else {
          callback(null, true);
        }
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // 加入會議室
    socket.on("join-meeting", async (meetingId) => {
      socket.join(`meeting-${meetingId}`);
      console.log(`Socket ${socket.id} joined meeting-${meetingId}`);

      // 從 Redis 撈暫存的會議資料（如果有的話）
      const meetingData = await redis.get(`meeting:${meetingId}`);
      if (meetingData) {
        socket.emit("meeting-data", JSON.parse(meetingData));
      }
    });

    // 離開會議室
    socket.on("leave-meeting", (meetingId) => {
      socket.leave(`meeting-${meetingId}`);
      console.log(`Socket ${socket.id} left meeting-${meetingId}`);
    });

    // 同步會議資料（暫存到 Redis，適合 "即時編輯"）
    socket.on("sync-meeting-data", async (data) => {
      const { meetingId, content } = data;

      await redis.set(`meeting:${meetingId}`, JSON.stringify(content));
      socket.to(`meeting-${meetingId}`).emit("meeting-updated", content);
    });

    // 同步腦力激盪資料
    socket.on("sync-brainstorm", async (data) => {
      const { meetingId, ideas } = data;

      await redis.set(`brainstorm:${meetingId}`, JSON.stringify(ideas));
      socket.to(`meeting-${meetingId}`).emit("brainstorm-updated", ideas);
    });

    socket.on("join-brainstorm", async (meetingId) => {
      socket.join(`meeting-${meetingId}`);
      console.log(`Socket ${socket.id} joined meeting-${meetingId}`);

      // 從 Redis 撈暫存的會議資料（如果有的話）
      const meetingData = await redis.get(`meeting:${meetingId}`);
      if (meetingData) {
        socket.emit("meeting-data", JSON.parse(meetingData));
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
}

module.exports = setupSocketIO;
