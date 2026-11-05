// Автотесты API. Запуск: npm test
// Перед тестами поднимается отдельный сервер на другом порту с временной базой,
// чтобы не портить основную базу kanban.db
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 3099;
const URL = `http://localhost:${PORT}/api`;
const dbFile = path.join(os.tmpdir(), 'kanban_test_' + Date.now() + '.db');
let server;

// токены двух пользователей
let ivan, petr, oleg;
let boardId, columns, cardId;

async function request(url, method = 'GET', body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(URL + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

before(async () => {
  server = spawn('node', ['index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT, DB_FILE: dbFile }
  });
  // ждем пока сервер напишет что запустился
  await new Promise((resolve) => {
    server.stdout.on('data', (d) => {
      if (d.toString().includes('Сервер запущен')) resolve();
    });
  });
});

after(async () => {
  // на windows файл базы занят, пока процесс сервера не завершится
  await new Promise((resolve) => {
    server.on('exit', resolve);
    server.kill();
  });
  fs.rmSync(dbFile, { force: true });
});

test('регистрация пользователей', async () => {
  let res = await request('/auth/register', 'POST', { name: 'Иван', email: 'ivan@test.ru', password: '123456' });
  assert.strictEqual(res.status, 200);
  assert.ok(res.data.token);
  ivan = res.data.token;

  res = await request('/auth/register', 'POST', { name: 'Петр', email: 'petr@test.ru', password: '123456' });
  petr = res.data.token;
  res = await request('/auth/register', 'POST', { name: 'Олег', email: 'oleg@test.ru', password: '123456' });
  oleg = res.data.token;
});

test('нельзя зарегистрироваться дважды с одним email', async () => {
  const res = await request('/auth/register', 'POST', { name: 'Иван 2', email: 'ivan@test.ru', password: '123456' });
  assert.strictEqual(res.status, 400);
});

test('короткий пароль не принимается', async () => {
  const res = await request('/auth/register', 'POST', { name: 'Тест', email: 'short@test.ru', password: '123' });
  assert.strictEqual(res.status, 400);
});

test('вход с неверным паролем', async () => {
  const res = await request('/auth/login', 'POST', { email: 'ivan@test.ru', password: 'wrong' });
  assert.strictEqual(res.status, 400);
});

test('без токена доступ запрещен', async () => {
  const res = await request('/boards');
  assert.strictEqual(res.status, 401);
});

test('создание доски по шаблону', async () => {
  let res = await request('/boards', 'POST', { title: 'Проект', template: 'basic' }, ivan);
  assert.strictEqual(res.status, 200);
  boardId = res.data.id;

  res = await request('/boards/' + boardId, 'GET', null, ivan);
  columns = res.data.columns;
  assert.deepStrictEqual(columns.map(c => c.title), ['Нужно сделать', 'В работе', 'Готово']);
  assert.strictEqual(res.data.members.length, 1);
  assert.strictEqual(res.data.members[0].role, 'owner');
});

test('чужой пользователь не видит доску', async () => {
  const res = await request('/boards/' + boardId, 'GET', null, petr);
  assert.strictEqual(res.status, 403);
});

test('добавление участника', async () => {
  let res = await request(`/boards/${boardId}/members`, 'POST', { email: 'petr@test.ru' }, ivan);
  assert.strictEqual(res.status, 200);

  res = await request('/boards/' + boardId, 'GET', null, petr);
  assert.strictEqual(res.status, 200);

  // участник не может приглашать других
  res = await request(`/boards/${boardId}/members`, 'POST', { email: 'oleg@test.ru' }, petr);
  assert.strictEqual(res.status, 403);
});

test('создание карточек и порядок в колонке', async () => {
  for (const title of ['A', 'B', 'C']) {
    await request(`/columns/${columns[0].id}/cards`, 'POST', { title }, ivan);
  }
  const res = await request('/boards/' + boardId, 'GET', null, ivan);
  const cards = res.data.columns[0].cards;
  assert.deepStrictEqual(cards.map(c => c.title), ['A', 'B', 'C']);
  assert.deepStrictEqual(cards.map(c => c.position), [0, 1, 2]);
  cardId = cards[0].id;
});

test('перемещение карточки внутри колонки', async () => {
  // A ставим в конец
  await request(`/cards/${cardId}/move`, 'PUT', { columnId: columns[0].id, position: 2 }, ivan);
  const res = await request('/boards/' + boardId, 'GET', null, ivan);
  assert.deepStrictEqual(res.data.columns[0].cards.map(c => c.title), ['B', 'C', 'A']);
});

test('перемещение карточки в другую колонку', async () => {
  await request(`/cards/${cardId}/move`, 'PUT', { columnId: columns[1].id, position: 0 }, ivan);
  const res = await request('/boards/' + boardId, 'GET', null, ivan);
  assert.deepStrictEqual(res.data.columns[0].cards.map(c => c.title), ['B', 'C']);
  assert.deepStrictEqual(res.data.columns[0].cards.map(c => c.position), [0, 1]);
  assert.deepStrictEqual(res.data.columns[1].cards.map(c => c.title), ['A']);
});

test('назначение исполнителя и дедлайна', async () => {
  const board = await request('/boards/' + boardId, 'GET', null, ivan);
  const petrId = board.data.members.find(m => m.name === 'Петр').id;

  let res = await request('/cards/' + cardId, 'PUT', { assigneeId: petrId, deadline: '2026-12-01' }, ivan);
  assert.strictEqual(res.status, 200);

  res = await request('/cards/' + cardId, 'GET', null, ivan);
  assert.strictEqual(res.data.assignee_id, petrId);
  assert.strictEqual(res.data.deadline, '2026-12-01');
});

test('исполнителем может быть только участник доски', async () => {
  const me = await request('/auth/me', 'GET', null, oleg);
  const res = await request('/cards/' + cardId, 'PUT', { assigneeId: me.data.id }, ivan);
  assert.strictEqual(res.status, 400);
});

test('комментарии к карточке', async () => {
  await request(`/cards/${cardId}/comments`, 'POST', { text: 'Первый комментарий' }, petr);
  const res = await request('/cards/' + cardId, 'GET', null, ivan);
  assert.strictEqual(res.data.comments.length, 1);
  assert.strictEqual(res.data.comments[0].user_name, 'Петр');

  // пустой комментарий
  const empty = await request(`/cards/${cardId}/comments`, 'POST', { text: '  ' }, petr);
  assert.strictEqual(empty.status, 400);
});

test('чек-лист', async () => {
  await request(`/cards/${cardId}/checklist`, 'POST', { text: 'Пункт 1' }, ivan);
  await request(`/cards/${cardId}/checklist`, 'POST', { text: 'Пункт 2' }, ivan);
  let res = await request('/cards/' + cardId, 'GET', null, ivan);
  await request('/checklist/' + res.data.checklist[0].id, 'PUT', { done: true }, ivan);

  res = await request('/boards/' + boardId, 'GET', null, ivan);
  const card = res.data.columns[1].cards[0];
  assert.strictEqual(card.checklist_total, 2);
  assert.strictEqual(card.checklist_done, 1);
});

test('метки на карточке', async () => {
  const board = await request('/boards/' + boardId, 'GET', null, ivan);
  const label = board.data.labels[0];
  await request(`/cards/${cardId}/labels/${label.id}`, 'POST', null, ivan);

  let res = await request('/cards/' + cardId, 'GET', null, ivan);
  assert.deepStrictEqual(res.data.labels, [label.id]);

  await request(`/cards/${cardId}/labels/${label.id}`, 'DELETE', null, ivan);
  res = await request('/cards/' + cardId, 'GET', null, ivan);
  assert.deepStrictEqual(res.data.labels, []);
});

test('история изменений записывается', async () => {
  const res = await request(`/boards/${boardId}/activity`, 'GET', null, ivan);
  const texts = res.data.map(a => a.text);
  assert.ok(texts.some(t => t.includes('переместил(а) карточку "A"')));
  assert.ok(texts.some(t => t.includes('прокомментировал(а)')));
});

test('удалить доску может только владелец', async () => {
  let res = await request('/boards/' + boardId, 'DELETE', null, petr);
  assert.strictEqual(res.status, 403);

  res = await request('/boards/' + boardId, 'DELETE', null, ivan);
  assert.strictEqual(res.status, 200);

  // карточки удалились вместе с доской
  res = await request('/cards/' + cardId, 'GET', null, ivan);
  assert.strictEqual(res.status, 404);
});
