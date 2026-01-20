require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb');
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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://vietinvesttvn_db_user:31acznx3P14AMR2D@cluster0.bauzlwl.mongodb.net/?appName=Cluster0';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// MongoDB Database Setup
let db;
const mongoClient = new MongoClient(MONGODB_URI);

async function initDb() {
  try {
    await mongoClient.connect();
    db = mongoClient.db('hichat');
    
    // Create collections and indexes
    const usersCollection = db.collection('users');
    const messagesCollection = db.collection('messages');
    
    await usersCollection.createIndex({ username: 1 }, { unique: true }).catch(() => {});
    await messagesCollection.createIndex({ createdAt: -1 }).catch(() => {});
    
    console.log('✅ Connected to MongoDB and collections initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
    process.exit(1);
  }
}

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
    const usersCollection = db.collection('users');
    
    const result = await usersCollection.insertOne({
      username,
      password: hashedPassword,
      createdAt: new Date()
    });
    
    const token = jwt.sign(
      { id: result.insertedId.toString(), username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token, username });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login Route
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  try {
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ username });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user._id.toString(), username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Order Route
app.post('/api/orders', verifyToken, async (req, res) => {
  const { items, note, total, username } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items in order' });
  }
  
  try {
    const ordersCollection = db.collection('orders');
    
    const result = await ordersCollection.insertOne({
      userId: new ObjectId(req.userId),
      username: req.username,
      items,
      note: note || '',
      total,
      status: 'pending',
      createdAt: new Date()
    });
    
    res.json({ 
      orderId: result.insertedId.toString(),
      message: 'Order placed successfully'
    });
  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// Get user's orders
app.get('/api/orders', verifyToken, async (req, res) => {
  try {
    const ordersCollection = db.collection('orders');
    
    const orders = await ordersCollection
      .find({ userId: new ObjectId(req.userId) })
      .sort({ createdAt: -1 })
      .toArray();
    
    res.json(orders.map(order => ({
      id: order._id.toString(),
      items: order.items,
      note: order.note,
      total: order.total,
      status: order.status,
      createdAt: order.createdAt
    })));
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// Get recent messages
async function getRecentMessages() {
  try {
    const messagesCollection = db.collection('messages');
    const messages = await messagesCollection
      .find({ deleted: false })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    
    return messages.reverse().map(msg => ({
      id: msg._id.toString(),
      text: msg.text,
      username: msg.username,
      ts: msg.createdAt.getTime(),
      deleted: msg.deleted
    }));
  } catch (err) {
    console.error('Get messages error:', err);
    return [];
  }
}

// Save message to DB
async function saveMessage(userId, username, text) {
  try {
    const messagesCollection = db.collection('messages');
    const result = await messagesCollection.insertOne({
      userId: new ObjectId(userId),
      username,
      text,
      deleted: false,
      createdAt: new Date()
    });
    return result.insertedId.toString();
  } catch (err) {
    console.error('Save message error:', err);
    return null;
  }
}

// Delete message
async function deleteMessage(msgId) {
  try {
    const messagesCollection = db.collection('messages');
    await messagesCollection.updateOne(
      { _id: new ObjectId(msgId) },
      { $set: { deleted: true } }
    );
    return true;
  } catch (err) {
    console.error('Delete message error:', err);
    return false;
  }
}

// Socket.IO Setup
const connectedUsers = new Map();

io.on('connection', (socket) => {
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
    const msgId = await saveMessage(userId, username, cleanText);
    
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

// Initialize database and start server
initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Chat server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
