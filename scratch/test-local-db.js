const fs = require('fs');
const initSqlJs = require('sql.js');
const path = require('path');

async function testLocalDb() {
  const DB_PATH = path.join(__dirname, '..', 'bot.db');
  console.log("DB File exists locally:", fs.existsSync(DB_PATH));
  if (fs.existsSync(DB_PATH)) {
    const stats = fs.statSync(DB_PATH);
    console.log("DB File Size:", stats.size, "bytes");
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(buffer);
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
    console.log("Tables in local bot.db:", tables[0] ? tables[0].values.flat() : []);
  }
}

testLocalDb();
