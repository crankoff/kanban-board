const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const boardRoutes = require('./routes/boards');
const cardRoutes = require('./routes/cards');
const attachmentRoutes = require('./routes/attachments');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.set('io', io);

app.use('/api/auth', authRoutes);
app.use('/api', boardRoutes);
app.use('/api', cardRoutes);
app.use('/api', attachmentRoutes);

// если фронт собран (npm run build в client) - отдаем его отсюда же
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Ошибка сервера' });
});

// websocket - каждая доска это отдельная комната
io.on('connection', (socket) => {
  socket.on('join_board', (boardId) => {
    socket.join('board_' + boardId);
  });
  socket.on('leave_board', (boardId) => {
    socket.leave('board_' + boardId);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('Сервер запущен на http://localhost:' + PORT);
});
