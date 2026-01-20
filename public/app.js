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

// Order Elements
const orderBtn = document.getElementById('order-btn');
const orderModal = document.getElementById('order-modal');
const submitOrderBtn = document.getElementById('submit-order-btn');
const closeBtn = document.querySelector('.close');
const cancelBtn = document.querySelector('.btn-cancel');
const orderNote = document.getElementById('order-note');
const totalPriceEl = document.getElementById('total-price');
const orderName = document.getElementById('order-name');
const orderPhone = document.getElementById('order-phone');
const orderAddress = document.getElementById('order-address');
const orderContact = document.getElementById('order-contact');

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
// Order Modal Functions
function openOrderModal() {
  orderModal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeOrderModal() {
  orderModal.classList.remove('show');
  document.body.style.overflow = 'auto';
  resetOrderForm();
}

function resetOrderForm() {
  document.querySelectorAll('input[name="food"]').forEach(cb => cb.checked = false);
  orderName.value = '';
  orderPhone.value = '';
  orderAddress.value = '';
  orderContact.value = '';
  orderNote.value = '';
  updateTotalPrice();
}

function updateTotalPrice() {
  let total = 0;
  document.querySelectorAll('input[name="food"]:checked').forEach(cb => {
    total += parseInt(cb.dataset.price);
  });
  totalPriceEl.textContent = total.toLocaleString('vi-VN');
}

async function submitOrder() {
  const name = orderName.value.trim();
  const phone = orderPhone.value.trim();
  const address = orderAddress.value.trim();
  const contact = orderContact.value;
  
  if (!name || !phone || !address || !contact) {
    alert('Vui lòng điền đủ thông tin người đặt');
    return;
  }
  
  const items = Array.from(document.querySelectorAll('input[name="food"]:checked')).map(cb => ({
    name: cb.value,
    price: parseInt(cb.dataset.price)
  }));
  
  if (items.length === 0) {
    alert('Vui lòng chọn ít nhất một món ăn');
    return;
  }
  
  const note = orderNote.value.trim();
  const total = items.reduce((sum, item) => sum + item.price, 0);
  
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        items,
        note,
        total,
        username,
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        contactMethod: contact
      })
    });
    
    if (res.ok) {
      const orderMsg = `🍜 Đặt hàng: ${items.map(i => i.name).join(', ')} | Người đặt: ${name} | SĐT: ${phone} | Tổng: ${total.toLocaleString('vi-VN')}đ`;
      socket.emit('chatMessage', orderMsg);
      alert('✅ Đặt hàng thành công! Vui lòng chờ xác nhận từ shop.');
      closeOrderModal();
    } else {
      alert('❌ Lỗi khi đặt hàng');
    }
  } catch (err) {
    console.error('Order error:', err);
    alert('❌ Không thể đặt hàng');
  }
}

// Order Event Listeners
orderBtn.addEventListener('click', openOrderModal);
closeBtn.addEventListener('click', closeOrderModal);
cancelBtn.addEventListener('click', closeOrderModal);
submitOrderBtn.addEventListener('click', submitOrder);

window.addEventListener('click', (e) => {
  if (e.target === orderModal) {
    closeOrderModal();
  }
});

document.querySelectorAll('input[name="food"]').forEach(cb => {
  cb.addEventListener('change', updateTotalPrice);
});