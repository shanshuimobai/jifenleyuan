const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express()
const path_option = path;
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 初始化数据库
const db = new Database(path.join(__dirname, "data.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    friendCode TEXT UNIQUE NOT NULL,
    points INTEGER DEFAULT 0,
    lastSync TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS friends (
    userId TEXT NOT NULL,
    friendId TEXT NOT NULL,
    PRIMARY KEY (userId, friendId)
  );
  CREATE TABLE IF NOT EXISTS task_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    taskName TEXT NOT NULL,
    points INTEGER NOT NULL,
    date TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ===== API =====

// 注册新用户
app.post("/api/register", (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.length > 20) return res.status(400).json({ error: "请输入名字（≤20字）" });
    const id = uuidv4().slice(0, 8);
    let code;
    // 确保好友码不重复
    for (let i = 0; i < 10; i++) {
      code = genCode();
      const exist = db.prepare("SELECT id FROM users WHERE friendCode = ?").get(code);
      if (!exist) break;
    }
    db.prepare("INSERT INTO users (id, name, friendCode) VALUES (?, ?, ?)").run(id, name, code);
    res.json({ userId: id, friendCode: code, name, points: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 通过好友码查找用户
app.get("/api/user/:code", (req, res) => {
  const user = db.prepare("SELECT id, name, friendCode, points FROM users WHERE friendCode = ?").get(req.params.code);
  if (!user) return res.status(404).json({ error: "未找到该好友码" });
  res.json(user);
});

// 获取自己的信息
app.get("/api/me/:userId", (req, res) => {
  const user = db.prepare("SELECT id, name, friendCode, points FROM users WHERE id = ?").get(req.params.userId);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  res.json(user);
});

// 同步积分
app.post("/api/sync", (req, res) => {
  try {
    const { userId, points, tasks } = req.body;
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!user) return res.status(404).json({ error: "用户不存在" });

    db.prepare("UPDATE users SET points = ?, lastSync = CURRENT_TIMESTAMP WHERE id = ?").run(points, userId);

    // 记录今天完成的任务
    if (tasks && Array.isArray(tasks)) {
      const today = new Date().toISOString().slice(0, 10);
      for (const t of tasks) {
        const exist = db.prepare("SELECT id FROM task_log WHERE userId = ? AND taskName = ? AND date = ?").get(userId, t.name, today);
        if (!exist) {
          db.prepare("INSERT INTO task_log (userId, taskName, points, date) VALUES (?, ?, ?, ?)").run(userId, t.name, t.points, today);
        }
      }
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 添加好友
app.post("/api/friend/add", (req, res) => {
  try {
    const { userId, friendCode } = req.body;
    const friend = db.prepare("SELECT id, name, friendCode, points FROM users WHERE friendCode = ?").get(friendCode);
    if (!friend) return res.status(404).json({ error: "好友码不存在" });
    if (friend.id === userId) return res.status(400).json({ error: "不能添加自己" });

    const exist = db.prepare("SELECT userId FROM friends WHERE userId = ? AND friendId = ?").get(userId, friend.id);
    if (exist) return res.status(400).json({ error: "已经是好友了" });

    db.prepare("INSERT INTO friends (userId, friendId) VALUES (?, ?)").run(userId, friend.id);
    res.json({ friend });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取好友列表 + 排行榜
app.get("/api/leaderboard/:userId", (req, res) => {
  try {
    const userId = req.params.userId;
    // 当前用户
    const me = db.prepare("SELECT id, name, friendCode, points FROM users WHERE id = ?").get(userId);
    if (!me) return res.status(404).json({ error: "用户不存在" });

    // 好友列表
    const friends = db.prepare(`
      SELECT u.id, u.name, u.friendCode, u.points FROM friends f
      JOIN users u ON u.id = f.friendId
      WHERE f.userId = ?
    `).all(userId);

    // 排行榜（自己 + 好友）
    const all = [me, ...friends];
    all.sort((a, b) => b.points - a.points);

    res.json({ me, friends, leaderboard: all });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除好友
app.post("/api/friend/remove", (req, res) => {
  try {
    const { userId, friendId } = req.body;
    db.prepare("DELETE FROM friends WHERE userId = ? AND friendId = ?").run(userId, friendId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log("积分乐园API运行在端口 " + PORT));

// 服务静态文件（HTML）
app.use(express.static(path.join(__dirname, '..')));
