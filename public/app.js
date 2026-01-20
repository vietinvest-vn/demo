const socket = io();

// Check auth
const token = localStorage.getItem('hichat:token');
const username = localStorage.getItem('hichat:username');

if (!token || !username) {
  window.location.href = '/login.html';
}

// Chat Elements
const messagesEl = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('m');
const onlineUsersEl = document.getElementById('online-users');
const onlineCountEl = document.getElementById('online-count');
const selfNameEl = document.getElementById('self-name');
const typingEl = document.getElementById('typing');
const logoutBtn = document.getElementById('logout-btn');

let typingTimeout;

// Markdown parser
function parseMarkdown(text) {
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/`(.+?)`/g, '<code>$1</code>');
  return text;
}

// Emoji suggestions
const emojiMap = {
  ':)': '😊', ':(': '😞', ':D': '😄', ':P': '😛', ':O': '😮',
  '<3': '❤️', ':fire:': '🔥', ':star:': '⭐', ':tada:': '🎉',
  ':+1:': '👍', ':-1:': '👎', ':wave:': '👋', ':clap:': '👏'
};

function addEmoji(text) {
  Object.keys(emojiMap).forEach(key => {
    text = text.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), emojiMap[key]);
  });
  return text;
}

function renderMessage(msg) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message' + (msg.username === username ? ' me' : '');
  wrapper.dataset.msgId = msg.id;

  const meta = document.createElement('div');
  meta.className = 'meta';
  const ts = new Date(msg.ts).toLocaleTimeString();
  meta.textContent = `${msg.username} • ${ts}`;

  const textEl = document.createElement('div');
  textEl.className = 'text';
  let html = parseMarkdown(msg.text);
  html = addEmoji(html);
  textEl.innerHTML = html;

  wrapper.appendChild(meta);
  wrapper.appendChild(textEl);

  if (msg.username === username) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.onclick = (e) => {
      e.preventDefault();
      if (confirm('Xoá tin này?')) {
        socket.emit('deleteMessage', msg.id);
      }
    };
    wrapper.appendChild(deleteBtn);
  }

  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateOnlineUsers(users) {
  onlineCountEl.textContent = users.length;
  onlineUsersEl.innerHTML = '';
  users.forEach(user => {
    const userEl = document.createElement('div');
    userEl.className = 'user-item';
    userEl.textContent = user.username;
    if (user.username === username) userEl.classList.add('self');
    onlineUsersEl.appendChild(userEl);
  });
}

function logout() {
  localStorage.removeItem('hichat:token');
  localStorage.removeItem('hichat:username');
  window.location.href = '/login.html';
}

// Initialize
selfNameEl.textContent = username;
socket.emit('authenticate', { token });

// Socket Events
socket.on('authenticated', () => {
  console.log('✅ Authenticated');
});

socket.on('authError', (err) => {
  console.error('Auth error:', err);
  window.location.href = '/login.html';
});

socket.on('recentMessages', (messages) => {
  messagesEl.innerHTML = '';
  messages.forEach(renderMessage);
});

socket.on('chatMessage', renderMessage);

socket.on('messageDeleted', (msgId) => {
  const msgEl = messagesEl.querySelector(`[data-msg-id="${msgId}"]`);
  if (msgEl) msgEl.remove();
});

socket.on('usersOnline', updateOnlineUsers);

socket.on('typing', (payload) => {
  if (!payload?.isTyping) {
    typingEl.textContent = '';
    return;
  }
  typingEl.textContent = `${payload.username} đang nhập...`;
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { typingEl.textContent = ''; }, 2000);
});

// Event Listeners
logoutBtn.addEventListener('click', logout);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chatMessage', text);
  input.value = '';
  socket.emit('typing', false);
});

input.addEventListener('input', () => {
  socket.emit('typing', input.value.length > 0);
});
