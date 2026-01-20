const socket = io();

const messagesEl = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('m');
const nameInput = document.getElementById('name');
const saveNameBtn = document.getElementById('save-name');
const typingEl = document.getElementById('typing');
const selfNameEl = document.getElementById('self-name');
const onlineUsersEl = document.getElementById('online-users');
const onlineCountEl = document.getElementById('online-count');

let selfName = localStorage.getItem('hichat:name') || '';
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
  wrapper.className = 'message' + (msg.author === selfName ? ' me' : '');
  wrapper.dataset.msgId = msg.id;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${msg.author} • ${new Date(msg.ts).toLocaleTimeString()}`;

  const textEl = document.createElement('div');
  textEl.className = 'text';
  let html = parseMarkdown(msg.text);
  html = addEmoji(html);
  textEl.innerHTML = html;

  wrapper.appendChild(meta);
  wrapper.appendChild(textEl);

  // Add delete button for own messages
  if (msg.author === selfName) {
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

function sendName() {
  const name = nameInput.value.trim();
  socket.emit('setName', name);
}

function setSelfName(name) {
  selfName = name;
  localStorage.setItem('hichat:name', name);
  selfNameEl.textContent = name;
  nameInput.value = name;
}

function updateOnlineUsers(users) {
  onlineCountEl.textContent = users.length;
  onlineUsersEl.innerHTML = '';
  users.forEach(user => {
    const userEl = document.createElement('div');
    userEl.className = 'user-item';
    userEl.textContent = user.name;
    if (user.name === selfName) userEl.classList.add('self');
    onlineUsersEl.appendChild(userEl);
  });
}

socket.on('connect', () => {
  if (selfName) {
    socket.emit('setName', selfName);
  }
});

socket.on('recentMessages', msgs => {
  messagesEl.innerHTML = '';
  msgs.forEach(renderMessage);
});

socket.on('nameAccepted', setSelfName);

socket.on('chatMessage', renderMessage);

socket.on('messageDeleted', msgId => {
  const msgEl = messagesEl.querySelector(`[data-msg-id="${msgId}"]`);
  if (msgEl) msgEl.remove();
});

socket.on('usersOnline', updateOnlineUsers);

socket.on('userNameChanged', (data) => {
  const messages = messagesEl.querySelectorAll('.message');
  messages.forEach(msg => {
    // Update author names in messages if needed (optional)
  });
});

socket.on('userLeft', (name) => {
  // Optional: show notification
});

socket.on('typing', payload => {
  if (!payload?.isTyping) {
    typingEl.textContent = '';
    return;
  }
  typingEl.textContent = `${payload.name} đang nhập...`;
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { typingEl.textContent = ''; }, 2000);
});

form.addEventListener('submit', e => {
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

saveNameBtn.addEventListener('click', sendName);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendName(); });

if (selfName) {
  setSelfName(selfName);
}
