# Павутина — План Розробки

---

## Фаза 1 — Фундамент

### 1.1 Інфраструктура та Docker
- [x] Git репозиторій
- [x] Next.js 15 (TypeScript, Tailwind, App Router)
- [x] FastAPI backend зі структурою (routers, models, services, tasks, core)
- [x] Docker: frontend (multi-stage build, standalone)
- [x] Docker: backend (Python 3.12-slim)
- [x] Docker: Celery worker + Celery beat
- [x] Docker: MongoDB 7, Redis 7
- [x] Docker: Nginx reverse proxy (/, /api/, /ws/)
- [x] docker-compose.yml — 7 сервісів, все піднімається однією командою
- [x] .env / .env.example / .gitignore

### 1.2 Backend API (FastAPI)
- [x] Конфігурація (pydantic-settings, .env)
- [x] MongoDB підключення (motor async)
- [x] JWT авторизація (python-jose, passlib bcrypt)
- [x] Моделі: User, Contact, Canvas, Page, Action, Message, Notification
- [x] Роутери: auth, contacts, canvas, pages, actions, messages, notifications
- [x] WebSocket endpoint `/ws/{user_id}`
- [x] WebSocket Manager (send_to_user)
- [x] Claude AI сервіс (генерація Actions)
- [x] Unipile сервіс (placeholder, готовий до підключення)
- [x] Celery tasks (execute_action, sync_contacts — placeholder)
- [x] Health check `/health`

### 1.3 Frontend — Sidebar та Layout
- [x] App layout з sidebar (5 сторінок)
- [x] Sidebar компонент: Павутина, Actions, Inbox, Notifications, Notion
- [x] Іконки та навігація (active state)
- [x] Темна тема (zinc-950 база)
- [x] Zustand store (auth-store, ui-store)
- [x] API client (axios instance з JWT interceptor)
- [x] Sidebar collapse/expand
- [x] Badge для непрочитаних (Inbox, Notifications)
- [x] Сторінки-стаби для всіх 5 розділів

### 1.4 Auth (Frontend)
- [x] Сторінка Login
- [x] Сторінка Register
- [x] AuthGuard компонент (redirect якщо не залогінений)
- [x] JWT в httpOnly cookie (не localStorage — захист від XSS)
- [x] Компонент профілю в sidebar (аватар, ім'я, logout)
- [x] POST /auth/logout з очищенням cookie

### 1.5 Павутина Canvas (3D Force Graph)
- [x] react-force-graph-3d + Three.js (Obsidian-style 3D граф)
- [x] Кастомний вузол ContactNode (canvas текстура: аватар, ім'я, платформа)
- [x] Центральний вузол "Ви" (violet, пульсуючий)
- [x] 3D обертання мишкою як глобус
- [x] Drag-and-drop нод з фізикою
- [x] Зум скролом, force-directed layout
- [x] Кольорові edge по типу зв'язку (partner/client/friend/acquaintance)
- [x] ContactPanel — панель контакту справа при кліку
- [x] AddContactModal — модалка додавання контакту
- [x] CRUD контактів через canvas → MongoDB
- [x] Анімація камери при кліку на ноду
- [x] useCanvas hook — завантаження/створення/видалення контактів через API

### 1.6 Інтеграції та імпорт контактів

#### Free (OAuth + ручний імпорт)
- [x] Сторінка "Інтеграції" (`/integrations`) в sidebar
- [x] Сторінка "Контакти" (`/contacts`) — таблиця з пошуком, редагування, видалення
- [x] CSV імпорт (drag & drop модалка, дублікати пропускаються)
- [x] Ручне додавання контакту через модалку (ім'я, прізвище, платформа, посада, компанія, email, телефон, теги)
- [x] Редагування контакту (клік на рядок → модалка з усіма полями)
- [x] Завантаження аватару (upload фото, base64 в MongoDB)
- [x] Аватар відображається в таблиці, на canvas, в бічній панелі
- [x] Контакти з повними полями: email, phone, job_title, company, website, avatar_url
- [x] Telegram Client API (Telethon):
  - [x] Авторизація: номер телефону → код → 2FA
  - [x] Сесія зберігається в MongoDB (StringSession)
  - [x] Пошук контактів без авто-імпорту
  - [x] Вибір конкретних контактів (checkbox + select all)
  - [x] Повторна синхронізація без повторного логіну
  - [x] Відключення з очисткою сесії
- [x] Gmail OAuth (Google):
  - [x] OAuth flow (авторизація → callback → токени в MongoDB)
  - [x] Пошук контактів без авто-імпорту (People API)
  - [x] Вибір конкретних контактів (checkbox + select all)
  - [x] Читання листів з контактом (Gmail API)
  - [x] Відправка листів (Gmail API)
  - [x] Відключення
- [x] LinkedIn OAuth (OpenID Connect):
  - [x] OAuth flow → профіль (ім'я, фото, email)
  - [x] Підключення / відключення
  - [ ] Імпорт connections (обмежено LinkedIn API — потребує Chrome Extension)
- [ ] Instagram OAuth (Business) — імпорт followers, DM (потребує Meta review)

#### Pro (Chrome Extension) — пізніше
- [ ] Chrome Extension: sync контактів з LinkedIn/Instagram
- [ ] Фонова синхронізація повідомлень (коли браузер відкритий)
- [ ] Перевірка плану юзера (Free vs Pro)

#### Enterprise (Unipile 24/7) — пізніше
- [ ] Unipile інтеграція для 24/7 sync
- [ ] Автоматичні Actions без браузера
- [ ] Real-time webhook від Unipile

#### Монетизація
- [ ] Free ($0): OAuth + CSV + базова павутина
- [ ] Pro ($29/міс): + Chrome Extension sync
- [ ] Enterprise ($99/міс): + Unipile 24/7 + автоматизація

---

## Фаза 2 — Серцевина

### 2.1 Notion-редактор у вузлах
- [ ] BlockNote редактор всередині кожного контакту
- [ ] Типи блоків: heading, paragraph, todo, image, video, table
- [ ] Вкладені підсторінки (sub_pages)
- [ ] Збереження блоків в MongoDB (pages колекція)
- [ ] Сторінка `/notion` — список всіх сторінок

### 2.2 Inmail Inbox
- [ ] Сторінка `/inbox` — список чатів
- [ ] ChatView компонент (повідомлення по контакту)
- [ ] Відправка повідомлень через Unipile
- [ ] Real-time отримання через WebSocket
- [ ] AI-підказки для відповідей (Claude)
- [ ] Фільтри: по платформі, по контакту, прочитані/непрочитані

### 2.3 Notifications
- [ ] Сторінка `/notifications` — центр сповіщень
- [ ] Real-time нотифікації через WebSocket
- [ ] Badge з кількістю непрочитаних в sidebar
- [ ] Типи: new_message, action_completed, new_post, connection_accepted
- [ ] Mark as read / Mark all as read

### 2.4 Фонові задачі
- [ ] Повна реалізація execute_action (Celery)
- [ ] Retry механізм + dead letter queue
- [ ] Sync contacts periodic task
- [ ] Webhook endpoint для Unipile (`/webhooks/unipile`)

---

## Фаза 3 — AI & Actions

### 3.1 Actions планувальник
- [ ] Сторінка `/actions` — список всіх автоматизацій
- [ ] Візуальний планувальник (тригер → умова → дія)
- [ ] Створення Action вручну (форма)
- [ ] Генерація Action через Claude AI (текстовий опис → JSON)
- [ ] Пауза / Активація / Видалення
- [ ] Логи виконання кожного Action

### 3.2 Тригери та умови
- [ ] Schedule (cron) — "кожен понеділок о 9:00"
- [ ] Event — no_reply (7 днів), birthday, new_post
- [ ] Condition — кастомні умови

### 3.3 AI інтеграція
- [ ] Chat з Claude всередині платформи
- [ ] AI suggestions при написанні повідомлень
- [ ] AI summary контакту (зібрати все в один overview)

---

## Фаза 4 — SaaS

### 4.1 Монетизація
- [ ] Stripe інтеграція
- [ ] Плани: Free ($0), Pro ($29), Enterprise ($99)
- [ ] Ліміти по плану (контакти, платформи, actions)
- [ ] Billing сторінка

### 4.2 Polish
- [ ] Onboarding flow для нових користувачів
- [ ] Multi-tenancy (ізоляція даних)
- [ ] Аналітика мережі (хто найцінніший контакт?)
- [ ] Мобільна адаптація (responsive / PWA)
- [ ] Performance: lazy loading графа, кластеризація 1000+ нод

---

## Поточний статус

**Завершено:** Фаза 1 (інфраструктура, API, auth, 3D canvas, Telegram, Gmail, LinkedIn, контакти, CSV)
**Залишилось у Фазі 1.6:** Instagram OAuth (потребує Meta review)
**Наступний крок:** Фаза 2 (Notion-редактор, Inbox з Telegram повідомленнями, Notifications)
