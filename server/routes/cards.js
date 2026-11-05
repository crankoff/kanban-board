const express = require('express');
const db = require('../db');
const { auth, isMember, getBoardIdByColumn, getBoardIdByCard, log, notify } = require('../helpers');

const router = express.Router();

// мидлвар для маршрутов /cards/:id - проверяет что карточка есть и юзер участник доски
function cardAccess(req, res, next) {
  const cardId = Number(req.params.id);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  if (!card) return res.status(404).json({ error: 'Карточка не найдена' });
  const boardId = getBoardIdByCard(cardId);
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });
  req.card = card;
  req.boardId = boardId;
  next();
}

router.post('/columns/:id/cards', auth, (req, res) => {
  const columnId = Number(req.params.id);
  const boardId = getBoardIdByColumn(columnId);
  if (!boardId || !isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Введите название карточки' });

  const max = db.prepare('SELECT MAX(position) AS m FROM cards WHERE column_id = ?').get(columnId);
  const position = max.m === null ? 0 : max.m + 1;

  const result = db.prepare('INSERT INTO cards (column_id, title, position, created_by) VALUES (?, ?, ?, ?)')
    .run(columnId, title, position, req.user.id);

  log(boardId, req.user.id, `создал(а) карточку "${title}"`);
  notify(req, boardId);
  res.json({ id: Number(result.lastInsertRowid) });
});

// подробная информация по карточке (для модального окна)
router.get('/cards/:id', auth, cardAccess, (req, res) => {
  const card = req.card;

  const comments = db.prepare(`
    SELECT cm.id, cm.text, cm.created_at, cm.user_id, u.name AS user_name
    FROM comments cm JOIN users u ON u.id = cm.user_id
    WHERE cm.card_id = ?
    ORDER BY cm.id`).all(card.id);

  const checklist = db.prepare('SELECT * FROM checklist_items WHERE card_id = ? ORDER BY position, id').all(card.id);
  const labels = db.prepare('SELECT label_id FROM card_labels WHERE card_id = ?').all(card.id).map(l => l.label_id);
  const column = db.prepare('SELECT title FROM board_columns WHERE id = ?').get(card.column_id);
  const author = db.prepare('SELECT name FROM users WHERE id = ?').get(card.created_by);
  const attachments = db.prepare(`
    SELECT a.id, a.original_name, a.mimetype, a.size, a.created_at, u.name AS user_name
    FROM attachments a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.card_id = ?
    ORDER BY a.id DESC`).all(card.id);

  res.json({
    ...card,
    column_title: column.title,
    author_name: author ? author.name : null,
    comments,
    checklist,
    labels,
    attachments
  });
});

router.put('/cards/:id', auth, cardAccess, (req, res) => {
  const card = req.card;
  const title = req.body.title !== undefined ? req.body.title.trim() : card.title;
  const description = req.body.description !== undefined ? req.body.description : card.description;
  let assigneeId = req.body.assigneeId !== undefined ? req.body.assigneeId : card.assignee_id;
  const deadline = req.body.deadline !== undefined ? (req.body.deadline || null) : card.deadline;

  if (!title) return res.status(400).json({ error: 'Название не может быть пустым' });

  if (assigneeId) {
    assigneeId = Number(assigneeId);
    if (!isMember(req.boardId, assigneeId)) {
      return res.status(400).json({ error: 'Исполнитель должен быть участником доски' });
    }
  } else {
    assigneeId = null;
  }

  db.prepare('UPDATE cards SET title = ?, description = ?, assignee_id = ?, deadline = ? WHERE id = ?')
    .run(title, description, assigneeId, deadline, card.id);

  // пишем в историю только то что реально поменялось
  if (title !== card.title) log(req.boardId, req.user.id, `переименовал(а) карточку "${card.title}" в "${title}"`);
  if (description !== card.description) log(req.boardId, req.user.id, `изменил(а) описание карточки "${title}"`);
  if (assigneeId !== card.assignee_id) {
    if (assigneeId) {
      const u = db.prepare('SELECT name FROM users WHERE id = ?').get(assigneeId);
      log(req.boardId, req.user.id, `назначил(а) ${u.name} исполнителем карточки "${title}"`);
    } else {
      log(req.boardId, req.user.id, `снял(а) исполнителя с карточки "${title}"`);
    }
  }
  if (deadline !== card.deadline) {
    log(req.boardId, req.user.id, deadline
      ? `установил(а) дедлайн ${deadline} для карточки "${title}"`
      : `убрал(а) дедлайн у карточки "${title}"`);
  }

  notify(req, req.boardId);
  res.json({ ok: true });
});

router.delete('/cards/:id', auth, cardAccess, (req, res) => {
  db.prepare('DELETE FROM cards WHERE id = ?').run(req.card.id);
  log(req.boardId, req.user.id, `удалил(а) карточку "${req.card.title}"`);
  notify(req, req.boardId);
  res.json({ ok: true });
});

// перемещение карточки: в другую колонку и/или на другую позицию
router.put('/cards/:id/move', auth, cardAccess, (req, res) => {
  const card = req.card;
  const columnId = Number(req.body.columnId);
  let position = Number(req.body.position) || 0;

  if (getBoardIdByColumn(columnId) !== req.boardId) {
    return res.status(400).json({ error: 'Колонка не найдена на этой доске' });
  }

  const update = db.prepare('UPDATE cards SET column_id = ?, position = ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    // пересчитываем позиции в старой колонке
    if (card.column_id !== columnId) {
      const oldCards = db.prepare('SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position, id')
        .all(card.column_id, card.id);
      oldCards.forEach((c, i) => update.run(card.column_id, i, c.id));
    }

    const ids = db.prepare('SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position, id')
      .all(columnId, card.id).map(c => c.id);
    if (position < 0) position = 0;
    if (position > ids.length) position = ids.length;
    ids.splice(position, 0, card.id);
    ids.forEach((id, i) => update.run(columnId, i, id));

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.log('ошибка при перемещении', e);
    return res.status(500).json({ error: 'Не удалось переместить карточку' });
  }

  if (card.column_id !== columnId) {
    const from = db.prepare('SELECT title FROM board_columns WHERE id = ?').get(card.column_id);
    const to = db.prepare('SELECT title FROM board_columns WHERE id = ?').get(columnId);
    log(req.boardId, req.user.id, `переместил(а) карточку "${card.title}" из "${from.title}" в "${to.title}"`);
  }

  notify(req, req.boardId);
  res.json({ ok: true });
});

// ---------- комментарии ----------

router.post('/cards/:id/comments', auth, cardAccess, (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Комментарий пустой' });

  db.prepare('INSERT INTO comments (card_id, user_id, text) VALUES (?, ?, ?)').run(req.card.id, req.user.id, text);
  log(req.boardId, req.user.id, `прокомментировал(а) карточку "${req.card.title}"`);
  notify(req, req.boardId);
  res.json({ ok: true });
});

router.delete('/comments/:id', auth, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(Number(req.params.id));
  if (!comment) return res.status(404).json({ error: 'Комментарий не найден' });
  if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Можно удалять только свои комментарии' });

  const boardId = getBoardIdByCard(comment.card_id);
  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  notify(req, boardId);
  res.json({ ok: true });
});

// ---------- метки на карточке ----------

router.post('/cards/:id/labels/:labelId', auth, cardAccess, (req, res) => {
  const label = db.prepare('SELECT * FROM labels WHERE id = ? AND board_id = ?').get(Number(req.params.labelId), req.boardId);
  if (!label) return res.status(404).json({ error: 'Метка не найдена' });

  db.prepare('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)').run(req.card.id, label.id);
  notify(req, req.boardId);
  res.json({ ok: true });
});

router.delete('/cards/:id/labels/:labelId', auth, cardAccess, (req, res) => {
  db.prepare('DELETE FROM card_labels WHERE card_id = ? AND label_id = ?').run(req.card.id, Number(req.params.labelId));
  notify(req, req.boardId);
  res.json({ ok: true });
});

// ---------- чек-лист ----------

router.post('/cards/:id/checklist', auth, cardAccess, (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Пустой пункт' });

  const max = db.prepare('SELECT MAX(position) AS m FROM checklist_items WHERE card_id = ?').get(req.card.id);
  const position = max.m === null ? 0 : max.m + 1;
  db.prepare('INSERT INTO checklist_items (card_id, text, position) VALUES (?, ?, ?)').run(req.card.id, text, position);
  notify(req, req.boardId);
  res.json({ ok: true });
});

router.put('/checklist/:id', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Пункт не найден' });
  const boardId = getBoardIdByCard(item.card_id);
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  const done = req.body.done !== undefined ? (req.body.done ? 1 : 0) : item.done;
  const text = req.body.text !== undefined ? req.body.text.trim() : item.text;
  db.prepare('UPDATE checklist_items SET done = ?, text = ? WHERE id = ?').run(done, text, item.id);
  notify(req, boardId);
  res.json({ ok: true });
});

router.delete('/checklist/:id', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Пункт не найден' });
  const boardId = getBoardIdByCard(item.card_id);
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  db.prepare('DELETE FROM checklist_items WHERE id = ?').run(item.id);
  notify(req, boardId);
  res.json({ ok: true });
});

module.exports = router;
