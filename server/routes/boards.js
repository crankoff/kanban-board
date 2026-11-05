const express = require('express');
const db = require('../db');
const { auth, isMember, isOwner, getBoardIdByColumn, log, notify } = require('../helpers');

const router = express.Router();

// шаблоны досок - какие колонки создавать сразу
const templates = {
  empty: [],
  basic: ['Нужно сделать', 'В работе', 'Готово'],
  scrum: ['Бэклог', 'Нужно сделать', 'В работе', 'На проверке', 'Готово'],
  study: ['Задания', 'Делаю', 'Сдано', 'Зачтено']
};

const defaultLabels = [
  { name: 'Баг', color: '#eb5a46' },
  { name: 'Фича', color: '#61bd4f' },
  { name: 'Срочно', color: '#ff9f1a' },
  { name: 'Дизайн', color: '#c377e0' }
];

// список досок пользователя
router.get('/boards', auth, (req, res) => {
  const boards = db.prepare(`
    SELECT b.*, u.name AS owner_name,
      (SELECT COUNT(*) FROM board_members WHERE board_id = b.id) AS members_count
    FROM boards b
    JOIN board_members bm ON bm.board_id = b.id
    JOIN users u ON u.id = b.owner_id
    WHERE bm.user_id = ?
    ORDER BY b.created_at DESC, b.id DESC`).all(req.user.id);
  res.json(boards);
});

router.post('/boards', auth, (req, res) => {
  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  const template = templates[req.body.template] ? req.body.template : 'basic';

  if (!title) return res.status(400).json({ error: 'Введите название доски' });

  const result = db.prepare('INSERT INTO boards (title, description, owner_id) VALUES (?, ?, ?)')
    .run(title, description, req.user.id);
  const boardId = Number(result.lastInsertRowid);

  db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(boardId, req.user.id, 'owner');

  const addColumn = db.prepare('INSERT INTO board_columns (board_id, title, position) VALUES (?, ?, ?)');
  templates[template].forEach((colTitle, i) => addColumn.run(boardId, colTitle, i));

  const addLabel = db.prepare('INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)');
  defaultLabels.forEach(l => addLabel.run(boardId, l.name, l.color));

  log(boardId, req.user.id, 'создал(а) доску');

  res.json({ id: boardId });
});

// вся доска целиком: колонки, карточки, метки, участники
router.get('/boards/:id', auth, (req, res) => {
  const boardId = Number(req.params.id);
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId);
  if (!board) return res.status(404).json({ error: 'Доска не найдена' });
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа к доске' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, bm.role FROM board_members bm
    JOIN users u ON u.id = bm.user_id
    WHERE bm.board_id = ?
    ORDER BY bm.role DESC, u.name`).all(boardId);

  const columns = db.prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position, id').all(boardId);

  const cards = db.prepare(`
    SELECT c.*, u.name AS assignee_name,
      (SELECT COUNT(*) FROM comments WHERE card_id = c.id) AS comments_count,
      (SELECT COUNT(*) FROM attachments WHERE card_id = c.id) AS attachments_count,
      (SELECT COUNT(*) FROM checklist_items WHERE card_id = c.id) AS checklist_total,
      (SELECT COUNT(*) FROM checklist_items WHERE card_id = c.id AND done = 1) AS checklist_done
    FROM cards c
    JOIN board_columns bc ON bc.id = c.column_id
    LEFT JOIN users u ON u.id = c.assignee_id
    WHERE bc.board_id = ?
    ORDER BY c.position, c.id`).all(boardId);

  const labels = db.prepare('SELECT * FROM labels WHERE board_id = ? ORDER BY id').all(boardId);
  const cardLabels = db.prepare(`
    SELECT cl.card_id, cl.label_id FROM card_labels cl
    JOIN labels l ON l.id = cl.label_id
    WHERE l.board_id = ?`).all(boardId);

  const result = { ...board, members, labels, columns: [] };
  for (const col of columns) {
    const colCards = cards.filter(c => c.column_id === col.id).map(c => ({
      ...c,
      labels: cardLabels.filter(x => x.card_id === c.id).map(x => x.label_id)
    }));
    result.columns.push({ ...col, cards: colCards });
  }

  res.json(result);
});

router.put('/boards/:id', auth, (req, res) => {
  const boardId = Number(req.params.id);
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  const title = (req.body.title || '').trim();
  const description = (req.body.description || '').trim();
  if (!title) return res.status(400).json({ error: 'Название не может быть пустым' });

  db.prepare('UPDATE boards SET title = ?, description = ? WHERE id = ?').run(title, description, boardId);
  log(boardId, req.user.id, `изменил(а) название доски на "${title}"`);
  notify(req, boardId);
  res.json({ ok: true });
});

router.delete('/boards/:id', auth, (req, res) => {
  const boardId = Number(req.params.id);
  if (!isOwner(boardId, req.user.id)) {
    return res.status(403).json({ error: 'Удалить доску может только владелец' });
  }
  db.prepare('DELETE FROM boards WHERE id = ?').run(boardId);
  notify(req, boardId);
  res.json({ ok: true });
});

// ---------- участники ----------

router.post('/boards/:id/members', auth, (req, res) => {
  const boardId = Number(req.params.id);
  if (!isOwner(boardId, req.user.id)) {
    return res.status(403).json({ error: 'Добавлять участников может только владелец' });
  }
  const email = (req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Пользователь с таким email не найден' });
  if (isMember(boardId, user.id)) return res.status(400).json({ error: 'Пользователь уже участник доски' });

  db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(boardId, user.id, 'member');
  log(boardId, req.user.id, `добавил(а) участника ${user.name}`);
  notify(req, boardId);
  res.json({ ok: true });
});

router.delete('/boards/:id/members/:userId', auth, (req, res) => {
  const boardId = Number(req.params.id);
  const userId = Number(req.params.userId);
  // владелец может удалить любого, участник может выйти сам
  if (!isOwner(boardId, req.user.id) && req.user.id !== userId) {
    return res.status(403).json({ error: 'Нет прав' });
  }
  if (isOwner(boardId, userId)) {
    return res.status(400).json({ error: 'Владельца нельзя удалить с доски' });
  }

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  db.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?').run(boardId, userId);
  // снимаем его с карточек этой доски
  db.prepare(`
    UPDATE cards SET assignee_id = NULL
    WHERE assignee_id = ? AND column_id IN (SELECT id FROM board_columns WHERE board_id = ?)`).run(userId, boardId);

  log(boardId, req.user.id, `удалил(а) участника ${user ? user.name : ''}`);
  notify(req, boardId);
  res.json({ ok: true });
});

// ---------- колонки ----------

router.post('/boards/:id/columns', auth, (req, res) => {
  const boardId = Number(req.params.id);
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Введите название колонки' });

  const max = db.prepare('SELECT MAX(position) AS m FROM board_columns WHERE board_id = ?').get(boardId);
  const position = max.m === null ? 0 : max.m + 1;
  db.prepare('INSERT INTO board_columns (board_id, title, position) VALUES (?, ?, ?)').run(boardId, title, position);

  log(boardId, req.user.id, `добавил(а) колонку "${title}"`);
  notify(req, boardId);
  res.json({ ok: true });
});

router.put('/columns/:id', auth, (req, res) => {
  const columnId = Number(req.params.id);
  const boardId = getBoardIdByColumn(columnId);
  if (!boardId || !isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Название не может быть пустым' });

  const old = db.prepare('SELECT title FROM board_columns WHERE id = ?').get(columnId);
  db.prepare('UPDATE board_columns SET title = ? WHERE id = ?').run(title, columnId);
  log(boardId, req.user.id, `переименовал(а) колонку "${old.title}" в "${title}"`);
  notify(req, boardId);
  res.json({ ok: true });
});

// сдвиг колонки влево/вправо
router.put('/columns/:id/move', auth, (req, res) => {
  const columnId = Number(req.params.id);
  const boardId = getBoardIdByColumn(columnId);
  if (!boardId || !isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  const cols = db.prepare('SELECT id FROM board_columns WHERE board_id = ? ORDER BY position, id').all(boardId).map(c => c.id);
  const index = cols.indexOf(columnId);
  const newIndex = req.body.direction === 'left' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= cols.length) return res.json({ ok: true });

  cols.splice(index, 1);
  cols.splice(newIndex, 0, columnId);
  const update = db.prepare('UPDATE board_columns SET position = ? WHERE id = ?');
  cols.forEach((id, i) => update.run(i, id));

  notify(req, boardId);
  res.json({ ok: true });
});

router.delete('/columns/:id', auth, (req, res) => {
  const columnId = Number(req.params.id);
  const boardId = getBoardIdByColumn(columnId);
  if (!boardId || !isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  const col = db.prepare('SELECT title FROM board_columns WHERE id = ?').get(columnId);
  db.prepare('DELETE FROM board_columns WHERE id = ?').run(columnId);
  log(boardId, req.user.id, `удалил(а) колонку "${col.title}"`);
  notify(req, boardId);
  res.json({ ok: true });
});

// ---------- метки ----------

router.post('/boards/:id/labels', auth, (req, res) => {
  const boardId = Number(req.params.id);
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });
  const name = (req.body.name || '').trim();
  const color = req.body.color || '#0079bf';
  if (!name) return res.status(400).json({ error: 'Введите название метки' });

  db.prepare('INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)').run(boardId, name, color);
  notify(req, boardId);
  res.json({ ok: true });
});

router.delete('/labels/:id', auth, (req, res) => {
  const label = db.prepare('SELECT * FROM labels WHERE id = ?').get(Number(req.params.id));
  if (!label) return res.status(404).json({ error: 'Метка не найдена' });
  if (!isMember(label.board_id, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  db.prepare('DELETE FROM labels WHERE id = ?').run(label.id);
  notify(req, label.board_id);
  res.json({ ok: true });
});

// ---------- история ----------

router.get('/boards/:id/activity', auth, (req, res) => {
  const boardId = Number(req.params.id);
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  const rows = db.prepare(`
    SELECT a.id, a.text, a.created_at, u.name AS user_name
    FROM activity a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.board_id = ?
    ORDER BY a.id DESC
    LIMIT 50`).all(boardId);
  res.json(rows);
});

module.exports = router;
