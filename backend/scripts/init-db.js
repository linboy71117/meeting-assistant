// scripts/init-db.js - 資料庫初始化腳本

const fs = require("fs");
const path = require("path");

async function initDatabase(pool) {
  try {
    console.log("檢查資料表是否存在...");

    // 檢查必要的資料表
    const requiredTables = [
      "users",
      "meetings",
      "meeting_participants",
      "agenda_items",
    ];

    const { rows } = await pool.query(
      `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = ANY($1::text[])
      AND table_schema = 'public'
    `,
      [requiredTables]
    );

    const existingTables = rows.map((r) => r.table_name);

    if (existingTables.length === requiredTables.length) {
      console.log("資料表已存在且完整，跳過初始化");
      return;
    }

    console.log("建立/修復資料表...");

    // 讀取 SQL schema
    const schemaPath = path.join(__dirname, "../../DB_scheme.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");

    // 執行 schema
    await pool.query(schema);

    console.log("資料表建立完成");
  } catch (error) {
    console.error("資料庫初始化失敗:", error.message);
    throw error;
  }
}

module.exports = initDatabase;
