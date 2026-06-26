const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 数据文件存储
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) {}
  return { users: {}, friends: {} };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// 根路径 - 服务页面
app.get("/", (req, res) => {
  const htmlPath = path.join(__dirname, "..", "积分乐园.html");
  const indexPath = path.join(__dirname, "..", "index.html");
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("文件未找到");
  }
});

// 注册新用户
app.post("/api/register", (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.length > 20) return res.status(400).json({ error: "请输入名字" });
    const data = loadData();
    const id = uuidv4().slice(0, 8);
    let code;
    for (let i = 0; i < 10; i++) {
      code = genCode();
      let exists = false;
      for (const uid in data.users) {
        if (data.users[uid].friendCode === code) { exists = true; break; }
      }
      if (!exists) break;
    }
    data.users[id] = { name, friendCode: code, points: 0, lastSync: new Date().toISOString() };
    saveData(data);
    res.json({ userId: id, friendCode: code, name, points: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/user/:code", (req, res) => {
  const data = loadData();
  for (const id in data.users) {
    if (data.users[id].friendCode === req.params.code) {
      return res.json({ id, name: data.users[id].name, friendCode: data.users[id].friendCode, points: data.users[id].points });
    }
  }
  res.status(404).json({ error: "未找到该好友码" });
});

app.get("/api/me/:userId", (req, res) => {
  const data = loadData();
  const user = data.users[req.params.userId];
  if (!user) return res.status(404).json({ error: "用户不存在" });
  res.json({ id: req.params.userId, name: user.name, friendCode: user.friendCode, points: user.points });
});

app.post("/api/sync", (req, res) => {
  try {
    const { userId, points } = req.body;
    const data = loadData();
    if (!data.users[userId]) return res.status(404).json({ error: "用户不存在" });
    data.users[userId].points = points;
    data.users[userId].lastSync = new Date().toISOString();
    saveData(data);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/friend/add", (req, res) => {
  try {
    const { userId, friendCode } = req.body;
    const data = loadData();
    let friendId = null;
    for (const id in data.users) {
      if (data.users[id].friendCode === friendCode) { friendId = id; break; }
    }
    if (!friendId) return res.status(404).json({ error: "好友码不存在" });
    if (friendId === userId) return res.status(400).json({ error: "不能添加自己" });
    if (!data.friends[userId]) data.friends[userId] = [];
    if (data.friends[userId].includes(friendId)) return res.status(400).json({ error: "已经是好友了" });
    data.friends[userId].push(friendId);
    saveData(data);
    res.json({ friend: data.users[friendId] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/leaderboard/:userId", (req, res) => {
  try {
    const data = loadData();
    const me = data.users[req.params.userId];
    if (!me) return res.status(404).json({ error: "用户不存在" });
    const friendsList = (data.friends[req.params.userId] || []).map(id => data.users[id]).filter(Boolean);
    const all = [{ id: req.params.userId, name: me.name, friendCode: me.friendCode, points: me.points }];
    friendsList.forEach(f => all.push({ name: f.name, friendCode: f.friendCode, points: f.points }));
    all.sort((a, b) => b.points - a.points);
    res.json({ me: all[0], friends: friendsList, leaderboard: all });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log("积分乐园API运行在端口 " + PORT));