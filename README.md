# Kanban-доска

Система управления задачами для командной работы (аналог Trello). Проект выполнен в рамках производственной практики.

## Возможности

- регистрация и вход (JWT)
- доски: создание, переименование, удаление, список досок пользователя
- у доски есть владелец и участники, владелец может приглашать участников по email
- колонки: создание, переименование, удаление, сдвиг влево/вправо
- карточки: название, описание, исполнитель, дедлайн (просроченные подсвечиваются красным, ближайшие оранжевым)
- перемещение карточек между колонками и внутри колонки перетаскиванием (drag&drop)
- комментарии к карточкам
- метки (теги) и фильтр по ним
- чек-лист внутри карточки
- вложения к карточкам (файлы до 10 МБ, для картинок показывается превью)
- поиск по карточкам, фильтр по исполнителю
- история изменений доски
- обновления в реальном времени через WebSocket (если доску открыли несколько человек)
- шаблоны досок при создании

## Технологии

- **Backend:** Node.js, Express, SQLite (встроенный модуль `node:sqlite`), Socket.IO, bcryptjs, jsonwebtoken, multer (загрузка файлов)
- **Frontend:** React, React Router, Vite, Socket.IO client

Нужна Node.js версии 22.13 и выше (из-за `node:sqlite`).

## Запуск

Сервер:

```
cd server
npm install
npm start
```

Сервер запустится на http://localhost:3001. База данных `kanban.db` создается автоматически при первом запуске.

Клиент (в другом терминале):

```
cd client
npm install
npm run dev
```

Открыть http://localhost:5173

Можно также собрать клиент командой `npm run build` в папке client, тогда сервер сам будет отдавать фронтенд и всё будет доступно на http://localhost:3001

## Тесты

Автотесты API написаны на встроенном в Node.js модуле `node:test`. Для тестов поднимается отдельный сервер с временной базой, основная база не меняется.

```
cd server
npm test
```

## Мобильная версия

Интерфейс адаптирован под экраны до 768px: колонки листаются по одной свайпом, меню и карточка открываются на весь экран. Так как drag&drop на телефоне не работает, карточку можно перенести в другую колонку через список «Колонка» в окне карточки.

## Структура базы данных

| Таблица | Описание |
|---|---|
| users | пользователи (id, name, email, password - хэш) |
| boards | доски (id, title, description, owner_id) |
| board_members | участники досок (board_id, user_id, role: owner/member) |
| board_columns | колонки (id, board_id, title, position) |
| cards | карточки (id, column_id, title, description, position, assignee_id, deadline, created_by) |
| comments | комментарии (id, card_id, user_id, text) |
| labels | метки доски (id, board_id, name, color) |
| card_labels | связь карточек и меток (многие ко многим) |
| checklist_items | пункты чек-листа (id, card_id, text, done, position) |
| attachments | вложения (id, card_id, user_id, filename, original_name, mimetype, size) |
| activity | история изменений (id, board_id, user_id, text) |

Сами файлы вложений хранятся в папке `server/uploads` под случайными именами, в базе хранится только информация о них.

Связи: доска -> колонки -> карточки -> комментарии/чек-лист/вложения. Порядок колонок и карточек хранится в поле `position`. При удалении доски удаляется всё связанное (ON DELETE CASCADE).

## API

| Метод | URL | Описание |
|---|---|---|
| POST | /api/auth/register | регистрация |
| POST | /api/auth/login | вход |
| GET | /api/auth/me | текущий пользователь |
| GET | /api/boards | список досок |
| POST | /api/boards | создать доску |
| GET | /api/boards/:id | доска с колонками и карточками |
| PUT | /api/boards/:id | изменить доску |
| DELETE | /api/boards/:id | удалить доску |
| POST | /api/boards/:id/members | добавить участника |
| DELETE | /api/boards/:id/members/:userId | удалить участника |
| GET | /api/boards/:id/activity | история |
| POST | /api/boards/:id/columns | создать колонку |
| PUT | /api/columns/:id | переименовать колонку |
| PUT | /api/columns/:id/move | сдвинуть колонку |
| DELETE | /api/columns/:id | удалить колонку |
| POST | /api/boards/:id/labels | создать метку |
| DELETE | /api/labels/:id | удалить метку |
| POST | /api/columns/:id/cards | создать карточку |
| GET | /api/cards/:id | карточка с комментариями и чек-листом |
| PUT | /api/cards/:id | изменить карточку |
| PUT | /api/cards/:id/move | переместить карточку |
| DELETE | /api/cards/:id | удалить карточку |
| POST | /api/cards/:id/comments | добавить комментарий |
| DELETE | /api/comments/:id | удалить комментарий |
| POST / DELETE | /api/cards/:id/labels/:labelId | повесить / снять метку |
| POST | /api/cards/:id/checklist | добавить пункт чек-листа |
| PUT | /api/checklist/:id | отметить пункт |
| DELETE | /api/checklist/:id | удалить пункт |
| POST | /api/cards/:id/attachments | загрузить файл (multipart, поле file) |
| GET | /api/attachments/:id/:name | открыть / скачать файл (`?download=1`) |
| DELETE | /api/attachments/:id | удалить файл |
