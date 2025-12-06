// config/database.js - 資料庫連線設定

const { Pool } = require("pg");
const Redis = require("ioredis");

// PostgreSQL 連線池
const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres",
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || "meeting_assistant",
  user: process.env.POSTGRES_USER || "meeting_user",
  password: process.env.POSTGRES_PASSWORD || "meeting_pass",
});

pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err);
});

// Redis 連線
const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on("connect", () => {
  console.log("✅ Connected to Redis");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

module.exports = { pool, redis };
