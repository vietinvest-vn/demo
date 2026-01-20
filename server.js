const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 8000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// SQLite Database Setup
const db = new sqlite3.Database(path.join(__dirname, 'chat.db'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      text TEXT,
      author TEXT,
      ts INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `);
});

// Store users online
const usersOnline = new Map();

// Load recent messages from DB
function getRecentMessages(callback) {
  db.all('SELECT * FROM messages WHERE deleted = 0 ORDER BY ts DESC LIMIT 100', (err, rows) => {
    if (err) return callback([]);
    callback((rows || []).reverse());
  });
}

// Save message to DB
function saveMessage(message, callback) {
  const { id, text, author, ts } = message;
  db.run(
    'INSERT INTO messages (id, text, author, ts) VALUES (?, ?, ?, ?)',
    [id, text, author, ts],
    callback
  );
}

// Delete message from DB
function deleteMessage(msgId, callback) {
  db.run('UPDATE messages SET deleted = 1 WHERE id = ?', [msgId], callback);
}

io.on('connection', socket => {
  let displayName = 'Ẩn danh';
  let userId = socket.id;

  // Add user to online list
  usersOnline.set(userId, { name: displayName, id: userId });
  io.emit('usersOnline', Array.from(usersOnline.values()));

  // Send recent messages
  getRecentMessages(messages => {
    socket.emit('recentMessages', messages);
  });

  socket.on('setName', name => {
    displayName = (name || '').trim() || 'Ẩn danh';
    usersOnline.set(userId, { name: displayName, id: userId });
    socket.emit('nameAccepted', displayName);
    io.emit('usersOnline', Array.from(usersOnline.values()));
    io.emit('userNameChanged', { id: userId, name: displayName });
  });

  socket.on('chatMessage', text => {
    const message = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: (text || '').toString().slice(0, 500),
      author: displayName,
      ts: Date.now()
    };

    saveMessage(message, (err) => {
      if (!err) {
        io.emit('chatMessage', message);
      }
    });
  });

  socket.on('deleteMessage', msgId => {
    deleteMessage(msgId, (err) => {
      if (!err) {
        io.emit('messageDeleted', msgId);
      }
    });
  });

  socket.on('typing', isTyping => {
    socket.broadcast.emit('typing', { name: displayName, isTyping: Boolean(isTyping) });
  });

  socket.on('disconnect', () => {
    usersOnline.delete(userId);
    io.emit('usersOnline', Array.from(usersOnline.values()));
    io.emit('userLeft', displayName);
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
});
