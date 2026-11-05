const jwt = require('jsonwebtoken');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'kanban_secret_123';

// проверка токена
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: 'Необходимо войти в систему' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Сессия истекла, войдите заново' });
  }
}

function isMember(boardId, userId) {
  const row = db.prepare('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?').get(boardId, userId);
  return !!row;
}

function isOwner(boardId, userId) {
  const board = db.prepare('SELECT owner_id FROM boards WHERE id = ?').get(boardId);
  return board && board.owner_id === userId;
}

function getBoardIdByColumn(columnId) {
  const row = db.prepare('SELECT board_id FROM board_columns WHERE id = ?').get(columnId);
  return row ? row.board_id : null;
}

function getBoardIdByCard(cardId) {
  const row = db.prepare(`
    SELECT bc.board_id FROM cards c
    JOIN board_columns bc ON bc.id = c.column_id
    WHERE c.id = ?`).get(cardId);
  return row ? row.board_id : null;
}

// запись в историю изменений доски
function log(boardId, userId, text) {
  db.prepare('INSERT INTO activity (board_id, user_id, text) VALUES (?, ?, ?)').run(boardId, userId, text);
}

// сообщаем всем кто открыл доску что она изменилась
function notify(req, boardId) {
  const io = req.app.get('io');
  if (io) io.to('board_' + boardId).emit('board_changed', { boardId });
}

module.exports = { SECRET, auth, isMember, isOwner, getBoardIdByColumn, getBoardIdByCard, log, notify };
