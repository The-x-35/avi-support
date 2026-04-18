# Avi Support — Internal Ops Dashboard

Production-grade internal support tool replacing Zendesk. AI-first, real-time, built for the Avici ops team.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend:** Next.js API routes, Node.js WebSocket server
- **Database:** PostgreSQL via Prisma 7 (driver adapter)
- **Auth:** Google OAuth + JWT (access + refresh tokens, HTTP-only cookies, RBAC)
- **AI:** OpenAI GPT-4o with streaming + auto-classification
- **Real-time:** Raw WebSocket server (no Socket.io)

## Features

- **Live Feed** — real-time conversation list with 10s auto-refresh
- **Conversation View** — streaming AI responses, agent takeover, pause/resume AI, typing indicators
- **Queue** — paused, escalated, and unassigned conversations
- **Analytics** — sentiment trends, top issues, daily volume, resolution rates
- **Segments** — custom filter builder, saved segments, CSV export
- **Auto-tagging** — AI classifies every conversation (issue type, sentiment, priority, product area)
- **User Profiles** — full conversation history per user

## Setup

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 2. Clone & Install

```bash
git clone <repo>
cd dashboard
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/api/auth/callback` |
| `OPENAI_API_KEY` | OpenAI API key |
| `JWT_ACCESS_SECRET` | 32+ char random string |
| `JWT_REFRESH_SECRET` | 32+ char random string |

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback`
4. Copy Client ID and Secret to `.env`

### 5. Database Setup

```bash
# Run migrations
npm run db:migrate

# Seed demo data (20 realistic conversations)
npm run db:seed
```

### 6. Run

```bash
# Terminal 1: Next.js app
npm run dev

# Terminal 2: WebSocket server
npm run dev:ws
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Authenticated pages
│   │   ├── page.tsx        # Overview
│   │   ├── live/           # Live feed
│   │   ├── queue/          # Queue
│   │   ├── analytics/      # Analytics
│   │   ├── segments/       # Segments
│   │   ├── conversations/  # Conversation detail
│   │   ├── users/          # User profiles
│   │   └── settings/       # Settings & admin
│   ├── api/                # API routes
│   │   ├── auth/           # Google OAuth, JWT refresh, logout
│   │   ├── conversations/  # CRUD + control endpoints
│   │   ├── analytics/      # Stats endpoints
│   │   ├── segments/       # Segment CRUD + execute + export
│   │   └── agents/         # Agent management
│   └── login/              # Login page
├── components/
│   ├── ui/                 # Badge, Button, Input, Avatar, StatCard
│   ├── layout/             # Sidebar, Header
│   ├── conversations/      # LiveFeed, Queue, ConversationView, UserProfile
│   ├── analytics/          # Charts, OverviewStats
│   └── segments/           # SegmentsView, SegmentBuilder, SegmentResults
├── lib/
│   ├── auth/               # JWT, cookies, Google OAuth, session
│   ├── db/                 # Prisma client
│   ├── ai/                 # OpenAI provider + abstract AIProvider interface
│   ├── services/           # Business logic (conversations, analytics, segments)
│   └── utils/              # cn, format
├── server/
│   └── ws.ts               # Standalone WebSocket server
└── prisma/
    ├── schema.prisma        # DB schema
    └── seed.ts             # Demo seed data
```

## WebSocket Events

**Client → Server:**
- `auth` — authenticate with JWT token
- `join` / `leave` — join/leave a conversation room
- `send_message` — send a message
- `typing` — typing indicator
- `control` — pause_ai / resume_ai / takeover / release

**Server → Client:**
- `message` — new message
- `ai_chunk` — streaming AI token
- `ai_done` — AI stream complete
- `typing` — typing indicator
- `control` — control state change
- `tag_update` — AI re-classified conversation

## Chat Screen Effects

When a user sends certain messages in the chat screen, a full-screen effect fires automatically.

| Effect | What it looks like | Trigger phrases |
|--------|-------------------|----------------|
| 🎊 **Confetti** | Dark saturated burst exploding upward | "it worked", "that fixed it", "working now", "problem solved", "fixed it", "all good now", "thank you", "thanks", "appreciate", "grateful" |
| 🎆 **Fireworks** | Real rockets launching and exploding | "finally", "you saved me", "lifesaver", "yes!", "perfect!" |
| ❤️ **Hearts** | Heart shapes bursting from all sides of the screen | "you're the best", "love this", "amazing support", "you're amazing", "best support" |
| 🔴 **Lasers** | iMessage-style neon laser beams sweeping L↔R | "pew pew" |

Matching is case-insensitive and substring-based — e.g. "thanks so much" triggers balloons.

## Auth Flow

1. `/api/auth/google` → redirects to Google OAuth
2. Google redirects to `/api/auth/callback` with code
3. Server exchanges code for Google user info
4. Upserts agent in DB, issues access (15m) + refresh (7d) JWT
5. Tokens set as HTTP-only cookies
6. Middleware validates access token on every request
7. Expired access token → redirected to `/api/auth/refresh`
8. Refresh rotates both tokens (revokes old refresh token in DB)

--
