# HiChat

Ứng dụng chat thời gian thực đơn giản giống Messenger, chạy bằng Node.js (Express + Socket.io). Giao diện thuần HTML/CSS/JS, không cần build.

## Cài đặt

1) Cài Node.js (>=16).  
2) Cài dependencies:
```
npm install
```

## Chạy

- Chế độ production:
```
npm start
```
- Chế độ phát triển (tự reload server):
```
npm run dev
```

Mở trình duyệt tại http://localhost:3000

## Tính năng

- Đặt tên hiển thị, lưu trong localStorage.  
- Gửi tin nhắn realtime.  
- Hiển thị lịch sử 100 tin gần nhất khi vừa vào.  
- Trạng thái “đang nhập” của người khác.

## Cấu trúc

- `server.js`: server Express + Socket.io, lưu tạm lịch sử trong RAM.  
- `public/`: giao diện tĩnh (`index.html`, `style.css`, `app.js`).  
- `package.json`: scripts và dependencies.

## Ghi chú

- Lịch sử chỉ lưu trong bộ nhớ, restart sẽ mất. Cần persist thì kết nối DB và thay `recentMessages`.  
- Không có xác thực; thêm auth khi triển khai thật.
