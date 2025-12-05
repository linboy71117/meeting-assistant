require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');

const app = express();
const httpServer = createServer(app);

// Redis 連接
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

// CORS 配置 - 允許 Chrome Extension 與所有來源
const corsOptions = {
  origin: true, // 允許所有來源，包括 Chrome Extension
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

// 最先應用 CORS（全局中間件）
app.use(cors(corsOptions));

app.use(express.json());

// Socket.IO 配置 - 允許 Chrome Extension
const io = new Server(httpServer, {
  cors: {
    origin: function (origin, callback) {
      if (!origin || origin.startsWith('chrome-extension://')) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Socket.IO 連接處理
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // 加入會議室
  socket.on('join-meeting', async (meetingId) => {
    socket.join(`meeting-${meetingId}`);
    console.log(`👥 Socket ${socket.id} joined meeting-${meetingId}`);
    
    // 從 Redis 獲取會議資料
    const meetingData = await redis.get(`meeting:${meetingId}`);
    if (meetingData) {
      socket.emit('meeting-data', JSON.parse(meetingData));
    }
  });

  // 離開會議室
  socket.on('leave-meeting', (meetingId) => {
    socket.leave(`meeting-${meetingId}`);
    console.log(`👋 Socket ${socket.id} left meeting-${meetingId}`);
  });

  // 同步會議資料
  socket.on('sync-meeting-data', async (data) => {
    const { meetingId, content } = data;
    
    // 儲存到 Redis
    await redis.set(`meeting:${meetingId}`, JSON.stringify(content));
    
    // 廣播給同一會議室的其他客戶端
    socket.to(`meeting-${meetingId}`).emit('meeting-updated', content);
  });

  // 同步腦力激盪資料
  socket.on('sync-brainstorm', async (data) => {
    const { meetingId, ideas } = data;
    
    // 儲存到 Redis
    await redis.set(`brainstorm:${meetingId}`, JSON.stringify(ideas));
    
    // 廣播給同一會議室的其他客戶端
    socket.to(`meeting-${meetingId}`).emit('brainstorm-updated', ideas);
  });

  // 斷線處理
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// REST API 端點
app.get('/health', (req, res) => {
  console.log('📋 /health request from:', req.headers.origin || 'no origin');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 獲取會議資料
app.get('/api/meetings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await redis.get(`meeting:${id}`);
    
    if (!data) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 儲存會議資料
app.post('/api/meetings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    await redis.set(`meeting:${id}`, JSON.stringify(data));
    
    // 通知其他連接的客戶端
    io.to(`meeting-${id}`).emit('meeting-updated', data);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving meeting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 獲取所有會議列表
app.get('/api/meetings', async (req, res) => {
  try {
    const keys = await redis.keys('meeting:*');
    const meetings = await Promise.all(
      keys.map(async (key) => {
        const data = await redis.get(key);
        const id = key.replace('meeting:', '');
        return { id, ...JSON.parse(data) };
      })
    );
    
    res.json(meetings);
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready`);
});