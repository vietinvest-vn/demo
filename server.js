require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// PostgreSQL Database Setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/hichat'
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Initialize database tables
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        text TEXT NOT NULL,
        deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

initDb();

// JWT Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.username = decoded.username;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Auth Routes
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    
    const token = jwt.sign(
      { id: result.rows[0].id, username: result.rows[0].username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token, username: result.rows[0].username });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  try {
    const result = await pool.query('SELECT id, username, password FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get recent messages from DB
async function getRecentMessages() {
  try {
    const result = await pool.query(`
      SELECT m.id, m.text, u.username, m.created_at as ts, m.deleted
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.deleted = false
      ORDER BY m.created_at DESC
      LIMIT 100
    `);
    return result.rows.reverse();
  } catch (err) {
    console.error('Get messages error:', err);
    return [];
  }
}

// Save message to DB
async function saveMessage(userId, text) {
  try {
    const result = await pool.query(
      'INSERT INTO messages (user_id, text) VALUES ($1, $2) RETURNING id',
      [userId, text]
    );
    return result.rows[0].id;
  } catch (err) {
    console.error('Save message error:', err);
    return null;
  }
}

// Delete message
async function deleteMessage(msgId) {
  try {
    await pool.query('UPDATE messages SET deleted = true WHERE id = $1', [msgId]);
    return true;
  } catch (err) {
    console.error('Delete message error:', err);
    return false;
  }
}

// Store connected users
const connectedUsers = new Map();

io.on('connection', socket => {
  let userId = null;
  let username = 'Anonymous';

  socket.on('authenticate', ({ token }) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
      username = decoded.username;
      
      connectedUsers.set(socket.id, { id: userId, username });
      
      // Send online users to all clients
      const onlineUsers = Array.from(connectedUsers.values());
      io.emit('usersOnline', onlineUsers);
      
      // Send recent messages
      getRecentMessages().then(messages => {
        socket.emit('recentMessages', messages);
      });
      
      socket.emit('authenticated', { username });
    } catch (err) {
      socket.emit('authError', 'Invalid token');
    }
  });

  socket.on('chatMessage', async (text) => {
    if (!userId) {
      socket.emit('error', 'Not authenticated');
      return;
    }
    
    const cleanText = (text || '').toString().slice(0, 500);
    const msgId = await saveMessage(userId, cleanText);
    
    if (msgId) {
      const message = {
        id: msgId,
        text: cleanText,
        username,
        ts: new Date().getTime()
      };
      io.emit('chatMessage', message);
    }
  });

  socket.on('deleteMessage', async (msgId) => {
    if (!userId) return;
    
    const success = await deleteMessage(msgId);
    if (success) {
      io.emit('messageDeleted', msgId);
    }
  });

  socket.on('typing', (isTyping) => {
    socket.broadcast.emit('typing', { username, isTyping: Boolean(isTyping) });
  });

  socket.on('disconnect', () => {
    connectedUsers.delete(socket.id);
    const onlineUsers = Array.from(connectedUsers.values());
    io.emit('usersOnline', onlineUsers);
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
});
