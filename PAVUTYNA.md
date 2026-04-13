# 🕸️ Павутина — Повна Документація Проекту

> **SaaS + CRM + Personal Knowledge Base** — жива мережа контактів з AI-автоматизацією, побудована навколо людських зв'язків.

---

## Зміст

1. [Концепція](#концепція)
2. [Технічний стек](#технічний-стек)
3. [Архітектура системи](#архітектура-системи)
4. [Структура бази даних](#структура-бази-даних)
5. [API документація](#api-документація)
6. [Модулі платформи](#модулі-платформи)
7. [Інтеграція Unipile](#інтеграція-unipile)
8. [AI та Actions](#ai-та-actions)
9. [Фазовий план розробки](#фазовий-план-розробки)
10. [Структура проекту](#структура-проекту)
11. [Запуск проекту](#запуск-проекту)

---

## Концепція

**Павутина** — це не звичайна CRM з таблицями. Це жива мережа зв'язків у вигляді інтерактивної павутини (як n8n), де кожен контакт — окремий вузол з власним Notion-workspace всередині.

### Ключові принципи

- **Вузол = Людина** — кожен контакт є нодою на канвасі
- **Павутина = Мережа** — нитки між нодами показують зв'язки
- **Notion всередині** — кожна нода має повноцінний блочний редактор
- **AI-автоматизація** — Claude генерує Actions за описом
- **Уніфікований Inbox** — всі повідомлення з LinkedIn та Instagram в одному місці

---

## Технічний стек

| Шар | Технологія | Версія | Призначення |
|-----|-----------|--------|-------------|
| Frontend | Next.js | 15+ | UI, роутинг, SSR |
| Canvas | React Flow | 11+ | Інтерактивна павутина |
| Редактор | BlockNote | latest | Notion-подібний редактор |
| Backend | FastAPI | 0.110+ | REST API + WebSocket |
| База даних | MongoDB | 7+ | Документна БД |
| Кеш | Redis | 7+ | Кеш, черги, pub/sub |
| Черга задач | Celery | 5+ | Фонові задачі |
| Інтеграції | Unipile API | v2 | LinkedIn, Instagram |
| AI | Claude API | claude-sonnet-4 | Генерація Actions |
| Авторизація | NextAuth + JWT | - | Auth система |
| Оплата | Stripe | - | Підписки SaaS |
| Деплой | Docker + Nginx | - | Контейнеризація |

---

## Архітектура системи

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT (Next.js)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Павутина │  │ Actions  │  │  Inbox   │  │ Notion │  │
│  │React Flow│  │Планувал. │  │ Unipile  │  │BlockNt.│  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTPS / WebSocket
┌─────────────────────────▼───────────────────────────────┐
│                   FastAPI Backend                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │  Auth    │  │ Contacts │  │ Messages │  │Actions │  │
│  │  Router  │  │  Router  │  │  Router  │  │ Router │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ WebSocket│  │  Celery  │  │   Claude AI Service   │  │
│  │  Manager │  │  Worker  │  │   Unipile Service     │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└───────┬──────────────┬───────────────┬──────────────────┘
        │              │               │
   ┌────▼────┐   ┌─────▼────┐   ┌─────▼────┐
   │ MongoDB │   │  Redis   │   │ Unipile  │
   │  Atlas  │   │  Cache   │   │   API    │
   └─────────┘   └──────────┘   └──────────┘
```

---

## Структура бази даних

### Колекція: `users`

```json
{
  "_id": "ObjectId",
  "email": "user@example.com",
  "name": "Ім'я Прізвище",
  "avatar_url": "https://...",
  "plan": "free | pro | enterprise",
  "unipile": {
    "account_id": "unipile_acc_123",
    "linkedin_connected": true,
    "instagram_connected": false,
    "tokens_encrypted": "..."
  },
  "settings": {
    "theme": "dark",
    "notifications": true,
    "ai_suggestions": true
  },
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

---

### Колекція: `contacts`

```json
{
  "_id": "ObjectId",
  "owner_id": "ObjectId (ref: users)",
  "name": "Іван Петренко",
  "avatar_url": "https://...",
  "platforms": [
    {
      "type": "linkedin",
      "profile_id": "ivan-petrenko-123",
      "profile_url": "https://linkedin.com/in/...",
      "connected_at": "ISODate"
    },
    {
      "type": "instagram",
      "profile_id": "@ivan_petrenko",
      "profile_url": "https://instagram.com/...",
      "connected_at": "ISODate"
    }
  ],
  "tags": ["B2B", "Product", "Kyiv"],
  "position": {
    "x": 320,
    "y": 180
  },
  "canvas_id": "ObjectId (ref: canvases)",
  "note_page_id": "ObjectId (ref: pages)",
  "last_interaction": "ISODate",
  "created_at": "ISODate"
}
```

---

### Колекція: `canvases`

```json
{
  "_id": "ObjectId",
  "owner_id": "ObjectId (ref: users)",
  "name": "Моя Мережа",
  "nodes": [
    {
      "contact_id": "ObjectId",
      "x": 500,
      "y": 340,
      "is_center": false
    }
  ],
  "edges": [
    {
      "from": "ObjectId (contact_id)",
      "to": "ObjectId (contact_id)",
      "type": "acquaintance | partner | client | friend",
      "strength": 1
    }
  ],
  "created_at": "ISODate"
}
```

---

### Колекція: `pages` (Notion-блоки)

```json
{
  "_id": "ObjectId",
  "owner_id": "ObjectId",
  "contact_id": "ObjectId | null",
  "parent_page_id": "ObjectId | null",
  "title": "Іван Петренко",
  "icon": "👤",
  "blocks": [
    {
      "id": "block_uuid",
      "type": "heading_1 | heading_2 | paragraph | todo | image | video | table | database | page",
      "content": "...",
      "checked": false,
      "children": [],
      "meta": {}
    }
  ],
  "sub_pages": ["ObjectId"],
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

---

### Колекція: `actions`

```json
{
  "_id": "ObjectId",
  "owner_id": "ObjectId",
  "contact_id": "ObjectId | null",
  "name": "Тижневий follow-up",
  "description": "Надсилати повідомлення кожного понеділка",
  "trigger": {
    "type": "schedule | event | condition",
    "cron": "0 9 * * 1",
    "event": "no_reply | birthday | new_post",
    "condition": {}
  },
  "steps": [
    {
      "order": 1,
      "type": "send_message | create_note | add_reminder | fetch_posts",
      "platform": "linkedin | instagram",
      "content": "Привіт {{name}}, як справи?",
      "delay_minutes": 0
    }
  ],
  "status": "active | paused | completed | error",
  "last_run": "ISODate",
  "next_run": "ISODate",
  "run_count": 14,
  "created_by_ai": true,
  "created_at": "ISODate"
}
```

---

### Колекція: `messages`

```json
{
  "_id": "ObjectId",
  "owner_id": "ObjectId",
  "contact_id": "ObjectId",
  "platform": "linkedin | instagram",
  "direction": "inbound | outbound",
  "content": "Привіт! Коли зможемо поговорити?",
  "media_urls": [],
  "unipile_message_id": "ext_msg_123",
  "read": false,
  "sent_at": "ISODate",
  "created_at": "ISODate"
}
```

---

### Колекція: `notifications`

```json
{
  "_id": "ObjectId",
  "owner_id": "ObjectId",
  "type": "new_message | action_completed | new_post | connection_accepted",
  "title": "Іван надіслав повідомлення",
  "body": "Привіт! Коли зможемо...",
  "contact_id": "ObjectId | null",
  "action_id": "ObjectId | null",
  "read": false,
  "platform": "linkedin | instagram | system",
  "created_at": "ISODate"
}
```

---

## API документація

### Base URL
```
https://api.pavutyna.app/v1
```

### Авторизація
```
Authorization: Bearer <JWT_TOKEN>
```

---

### Auth

| Метод | Endpoint | Опис |
|-------|----------|------|
| POST | `/auth/register` | Реєстрація |
| POST | `/auth/login` | Вхід |
| POST | `/auth/refresh` | Оновлення токену |
| DELETE | `/auth/logout` | Вихід |

---

### Contacts

| Метод | Endpoint | Опис |
|-------|----------|------|
| GET | `/contacts` | Список контактів |
| POST | `/contacts` | Створити контакт |
| GET | `/contacts/{id}` | Отримати контакт |
| PATCH | `/contacts/{id}` | Оновити контакт |
| DELETE | `/contacts/{id}` | Видалити контакт |
| POST | `/contacts/{id}/position` | Оновити позицію на канвасі |
| GET | `/contacts/{id}/messages` | Повідомлення контакту |
| GET | `/contacts/{id}/page` | Notion-сторінка контакту |

---

### Canvas

| Метод | Endpoint | Опис |
|-------|----------|------|
| GET | `/canvas` | Отримати канвас |
| POST | `/canvas/edges` | Додати зв'язок |
| DELETE | `/canvas/edges/{id}` | Видалити зв'язок |
| POST | `/canvas/import` | Імпорт з Unipile |

---

### Pages (Notion)

| Метод | Endpoint | Опис |
|-------|----------|------|
| GET | `/pages/{id}` | Отримати сторінку |
| POST | `/pages` | Створити сторінку |
| PATCH | `/pages/{id}` | Оновити блоки |
| DELETE | `/pages/{id}` | Видалити сторінку |
| POST | `/pages/{id}/blocks` | Додати блок |
| PATCH | `/pages/{id}/blocks/{block_id}` | Оновити блок |

---

### Actions

| Метод | Endpoint | Опис |
|-------|----------|------|
| GET | `/actions` | Список actions |
| POST | `/actions` | Створити action |
| POST | `/actions/generate` | Генерувати через AI |
| PATCH | `/actions/{id}` | Оновити action |
| POST | `/actions/{id}/toggle` | Пауза / Активація |
| DELETE | `/actions/{id}` | Видалити action |
| GET | `/actions/{id}/logs` | Логи виконання |

---

### Messages (Inbox)

| Метод | Endpoint | Опис |
|-------|----------|------|
| GET | `/messages` | Всі повідомлення |
| POST | `/messages/send` | Надіслати повідомлення |
| PATCH | `/messages/{id}/read` | Позначити як прочитане |

---

### WebSocket

```
wss://api.pavutyna.app/ws/{user_id}
```

**Events:**
```json
{ "type": "new_message",      "payload": { ... } }
{ "type": "notification",     "payload": { ... } }
{ "type": "action_completed", "payload": { ... } }
{ "type": "contact_updated",  "payload": { ... } }
```

---

## Модулі платформи

### 1. 🕸️ Павутина (Canvas)

- Побудована на **React Flow**
- Центральний вузол — сам користувач
- Drag-and-drop нод
- Зумування та пан
- Підсвітка зв'язків при наведенні
- Кольорове кодування по платформі (LinkedIn синій / Instagram рожевий)
- Клік на ноду → відкривається панель з вкладками

### 2. 📝 Notion-вузол

Кожен контакт має власну сторінку з:
- Блочним редактором (BlockNote)
- Вкладеними підсторінками
- Базами даних (таблиці)
- Чеклістами та задачами
- Медіа (фото, відео)
- Тегами та властивостями

### 3. ⚡ Actions

- Планувальник у стилі n8n
- Тригери: розклад (cron), подія, умова
- Кроки: відправка, нотатка, нагадування, збір даних
- Генерація через Claude AI за описом
- Логи виконання

### 4. ✉ Inmail Inbox

- Уніфіковані повідомлення з LinkedIn + Instagram
- Відповідь прямо з платформи
- AI-підказки для відповідей
- Сортування по контактах

### 5. 🔔 Notifications

- Real-time через WebSocket
- Нові повідомлення, виконані actions, нові пости
- Фільтри по платформі та типу

---

## Інтеграція Unipile

[Unipile](https://unipile.com) — єдиний API для LinkedIn та Instagram.

### Підключення акаунту

```python
# POST /unipile/connect
{
  "platform": "linkedin",
  "credentials": {
    "email": "user@example.com",
    "password": "..."  # шифрується перед збереженням
  }
}
```

### Отримання контактів

```python
# Unipile Service
async def sync_contacts(user_id: str, platform: str):
    accounts = await unipile.get_accounts(user_id)
    for account in accounts:
        relations = await unipile.get_relations(account.id)
        for relation in relations:
            await contact_service.upsert(user_id, relation)
```

### Відправка повідомлення

```python
async def send_message(contact_id: str, content: str, platform: str):
    account = await get_account(platform)
    result = await unipile.send_message(
        account_id=account.id,
        recipient_id=contact.platform_id,
        content=content
    )
    await message_service.save(result)
```

### Webhook від Unipile

```
POST /webhooks/unipile
```

Unipile надсилає події: нові повідомлення, нові з'єднання, нові пости.

---

## AI та Actions

### Генерація Action через Claude

```python
async def generate_action(description: str, context: dict) -> Action:
    prompt = f"""
    Користувач хоче створити автоматизацію:
    "{description}"
    
    Контекст: {context}
    
    Поверни JSON з полями:
    - name: назва action
    - trigger: тип і параметри тригеру
    - steps: масив кроків
    """
    
    response = await claude.messages.create(
        model="claude-sonnet-4-5",
        messages=[{"role": "user", "content": prompt}]
    )
    
    return Action.parse(response.content)
```

### Виконання Action (Celery)

```python
@celery.task
def execute_action(action_id: str):
    action = Action.get(action_id)
    
    for step in action.steps:
        if step.type == "send_message":
            unipile.send_message(step.contact, step.content)
        elif step.type == "create_note":
            page_service.add_block(step.page_id, step.block)
        elif step.type == "add_reminder":
            notification_service.schedule(step.contact, step.time)
    
    action.update(last_run=now(), next_run=calc_next(action.trigger))
```

---

## Фазовий план розробки

### 🔵 Фаза 1 — Фундамент (4–6 тижнів)

- [ ] Авторизація (NextAuth + JWT)
- [ ] Базовий React Flow канвас
- [ ] Підключення Unipile (LinkedIn + Instagram)
- [ ] Імпорт контактів → ноди на павутині
- [ ] MongoDB схема та базові API

### 🟡 Фаза 2 — Серцевина (6–8 тижнів)

- [ ] BlockNote редактор у вузлах
- [ ] Вкладені Notion-сторінки
- [ ] Inmail Inbox (уніфіковані повідомлення)
- [ ] Celery + Redis черга задач
- [ ] WebSocket нотифікації в реальному часі

### 🟠 Фаза 3 — AI & Actions (4–6 тижнів)

- [ ] Сторінка Actions з планувальником
- [ ] Інтеграція Claude API
- [ ] Генерація Actions за описом
- [ ] Система тригерів та умов
- [ ] Логи та моніторинг виконання

### 🔴 Фаза 4 — SaaS (4 тижні)

- [ ] Stripe підписки (Free / Pro / Enterprise)
- [ ] Multi-tenancy
- [ ] Аналітика мережі
- [ ] Мобільна адаптація (PWA)
- [ ] Onboarding flow

---

## Структура проекту

```
pavutyna/
├── frontend/                    # Next.js 15
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── (app)/
│   │   │   ├── web/             # Павутина Canvas
│   │   │   ├── actions/         # Actions планувальник
│   │   │   ├── inbox/           # Inmail Inbox
│   │   │   ├── notifications/   # Сповіщення
│   │   │   └── notion/          # Notion workspace
│   │   └── layout.tsx
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── WebCanvas.tsx
│   │   │   ├── ContactNode.tsx
│   │   │   └── EdgeLine.tsx
│   │   ├── notion/
│   │   │   ├── BlockEditor.tsx
│   │   │   ├── PageView.tsx
│   │   │   └── BlockTypes/
│   │   ├── inbox/
│   │   │   ├── MessageList.tsx
│   │   │   └── ChatView.tsx
│   │   └── ui/                  # Shared components
│   ├── lib/
│   │   ├── api.ts
│   │   ├── websocket.ts
│   │   └── unipile.ts
│   └── hooks/
│       ├── useCanvas.ts
│       ├── useMessages.ts
│       └── useActions.ts
│
├── backend/                     # FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── contacts.py
│   │   │   ├── canvas.py
│   │   │   ├── pages.py
│   │   │   ├── actions.py
│   │   │   ├── messages.py
│   │   │   └── webhooks.py
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── unipile_service.py
│   │   │   ├── claude_service.py
│   │   │   ├── action_service.py
│   │   │   └── websocket_manager.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── contact.py
│   │   │   ├── page.py
│   │   │   ├── action.py
│   │   │   └── message.py
│   │   ├── tasks/               # Celery tasks
│   │   │   ├── celery_app.py
│   │   │   ├── action_tasks.py
│   │   │   └── sync_tasks.py
│   │   └── config.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml
├── nginx.conf
└── README.md
```

---

## Запуск проекту

### Вимоги

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- MongoDB Atlas або локальний MongoDB
- Redis

### Змінні середовища

```env
# Backend (.env)
MONGODB_URI=mongodb+srv://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
UNIPILE_API_KEY=your-unipile-key
UNIPILE_DSN=your-unipile-dsn
ANTHROPIC_API_KEY=your-claude-key
STRIPE_SECRET_KEY=your-stripe-key

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

### Запуск через Docker

```bash
# Клонувати репозиторій
git clone https://github.com/your-org/pavutyna.git
cd pavutyna

# Запустити всі сервіси
docker-compose up -d

# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
# Docs API: http://localhost:8000/docs
```

### Запуск локально

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Celery Worker
celery -A app.tasks.celery_app worker --loglevel=info

# Frontend
cd frontend
npm install
npm run dev
```

---

## Монетизація

| План | Ціна | Ліміти |
|------|------|--------|
| Free | $0/міс | 50 контактів, 1 платформа, 5 actions |
| Pro | $29/міс | 2000 контактів, 2 платформи, необмежені actions |
| Enterprise | $99/міс | Необмежено, API доступ, пріоритетна підтримка |

---

## Ключові виклики та рішення

| Виклик | Рішення |
|--------|---------|
| Rate limits Unipile | Черга запитів + exponential backoff |
| Великі графи (1000+ нод) | Lazy loading, кластеризація React Flow |
| Real-time повідомлення | WebSocket + Redis Pub/Sub |
| Безпека OAuth токенів | AES-256 шифрування в MongoDB |
| Celery задачі | Retry механізм + dead letter queue |
| Блокові конфлікти Notion | Optimistic updates + operational transform |

---

*Документ актуальний станом на Квітень 2026. Версія 1.0.0*
