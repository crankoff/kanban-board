const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { auth, isMember, getBoardIdByCard, log, notify } = require('../helpers');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// файлы сохраняем под случайным именем, чтобы не было совпадений
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 мб
});

router.post('/cards/:id/attachments', auth, (req, res) => {
  const cardId = Number(req.params.id);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  if (!card) return res.status(404).json({ error: 'Карточка не найдена' });
  const boardId = getBoardIdByCard(cardId);
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Файл больше 10 МБ' });
      return res.status(400).json({ error: 'Не удалось загрузить файл' });
    }
    if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });

    // multer отдает имя в latin1, из-за этого ломаются русские названия
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    db.prepare(`INSERT INTO attachments (card_id, user_id, filename, original_name, mimetype, size)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(cardId, req.user.id, req.file.filename, originalName, req.file.mimetype, req.file.size);

    log(boardId, req.user.id, `прикрепил(а) файл "${originalName}" к карточке "${card.title}"`);
    notify(req, boardId);
    res.json({ ok: true });
  });
});

// скачивание - токен передаем в query, потому что ссылку открывает браузер
router.get('/attachments/:id/:name', (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = 'Bearer ' + req.query.token;
  }
  next();
}, auth, (req, res) => {
  const file = db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(req.params.id));
  if (!file) return res.status(404).json({ error: 'Файл не найден' });
  const boardId = getBoardIdByCard(file.card_id);
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  const filePath = path.join(uploadDir, file.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден на сервере' });

  if (req.query.download) {
    res.download(filePath, file.original_name);
  } else {
    res.type(file.mimetype || 'application/octet-stream');
    res.sendFile(filePath);
  }
});

router.delete('/attachments/:id', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(req.params.id));
  if (!file) return res.status(404).json({ error: 'Файл не найден' });
  const boardId = getBoardIdByCard(file.card_id);
  if (!isMember(boardId, req.user.id)) return res.status(403).json({ error: 'Нет доступа' });

  db.prepare('DELETE FROM attachments WHERE id = ?').run(file.id);
  fs.unlink(path.join(uploadDir, file.filename), () => {});

  log(boardId, req.user.id, `удалил(а) файл "${file.original_name}"`);
  notify(req, boardId);
  res.json({ ok: true });
});

module.exports = router;
