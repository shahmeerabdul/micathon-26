# Voice-Activated Vernacular Ledger (Digital **Khata** — کھاتہ)

> A voice-first FinTech prototype so shopkeepers can track **sales**, **customer credit (*udhaar*)**, and **supplier payables** by speaking in **Urdu or English** — minimal typing, mobile-first, bilingual labels.

Built for **Micathon '26 — "Money Moves"**.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target Audience](#3-target-audience)
4. [Core User Journey](#4-core-user-journey)
5. [What the App Does Today](#5-what-the-app-does-today)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [System Architecture](#7-system-architecture)
8. [Technology Stack](#8-technology-stack)
9. [Data Model](#9-data-model)
10. [API Reference](#10-api-reference)
11. [Getting Started](#11-getting-started)
12. [Project Structure](#12-project-structure)
13. [Hackathon Compliance](#13-hackathon-compliance)
14. [Roadmap](#14-roadmap)
15. [Repositories & Team](#15-repositories--team)

---

## 1. Executive Summary

**Khata** removes literacy and language friction for small retailers: one **hold-to-record** flow sends raw audio to **Google Gemini**, which returns a strict JSON **intent**. The server resolves **customers** and **purchases** in **MongoDB Atlas**, mirrors summaries into the **Zustand** ledger in the browser (**localStorage**), and can send **WhatsApp** receipts and welcomes via **Twilio** (optional).

The UI is **bilingual** (English + Urdu script on headers, nav, and key labels), tuned for a **phone-sized** shell on desktop and real devices.

---

## 2. Problem Statement

Mainstream accounting tools assume English menus, forms, and time to type each line. Many **kiryana** shops still use **paper *khata*** and memory for *udhaar* and supplier tabs.

That leads to forgotten balances, inconsistent totals across screens, and no single place that matches how the shopkeeper actually works — **spoken**, **fast**, **in the moment**.

---

## 3. Target Audience

| Persona | Description |
|---|---|
| **Primary** | Kiryana / general-store owners in Pakistan tracking customer debt and wholesaler payables. |
| **Literacy** | Comfortable with spoken Urdu and Roman Urdu; Urdu script used as supportive labels. |
| **Device** | Smartphone browser; microphone used for voice capture. |

---

## 4. Core User Journey

Example: *"Ahmed ne lays li, do sau rupay udhaar."*

1. Shopkeeper opens **Record**, holds **mic**, speaks, releases.
2. **`POST /api/voice/record`** sends the audio blob to the server (Node runtime).
3. **Gemini** transcribes and classifies the utterance into a typed intent (e.g. `purchase` debt, `payment`, `new_customer`, `supplier_payment`, `supplier_credit`, `cash_sale`, `query_bills`, …).
4. **MongoDB** upserts the customer (fuzzy name + **phone-first** match on WhatsApp number to avoid duplicates), inserts or updates **purchases** / balances as appropriate.
5. The client **mirrors** the result into **Zustand** (debts, payables, sales, contacts) so **Debt**, **Payables**, **Sales**, and **Contacts** stay aligned with what the server saved.
6. **Receipt** screen shows transcript, amounts, optional **WhatsApp** deep-link and **Done**; outbound messages go through **Twilio** when configured.

---

## 5. What the App Does Today

| Area | Behavior |
|---|---|
| **Voice intents** | Purchase on tab (debt), cash sale, payment toward debt, new customer, bill query, **supplier payment** (reduce payable), **supplier credit** (increase payable / merge by supplier), **cash_sale** (anonymous daily sale), **disambiguation** when two contacts match a name. |
| **Ledger UI** | Dashboard, **Debt** (grouped by contact), **Payables** (grouped by supplier), **Sales**, **Activity**, manual **New** flows for debt / payable / sale. |
| **Contacts** | List, detail, **delete** (blocked if open debts), call / WhatsApp links where phone exists. |
| **Entry detail** | View + **edit** amount / wholesaler / notes; mark settled or paid. |
| **Auth (demo)** | Simple **login** gate with fixed demo credentials (local Zustand); adjust or remove for production. |
| **WhatsApp** | Twilio-backed welcome, purchase receipt, bills summary; **Khata** signature in copy; client-side `wa.me` / web WhatsApp links from the receipt flow. |
| **Persistence** | **Hybrid**: MongoDB is source of truth for voice-backed customers & purchases; **localStorage** holds the full UI ledger for fast lists and offline-style demo. |

---

## 6. Non-Functional Requirements

| # | Attribute | Target |
|---|---|---|
| NF1 | **Usability** | Large touch targets, clear money-in / money-out cues, bilingual labels. |
| NF2 | **Resilience** | Lists and manual edits work from local state; voice path requires network + API keys. |
| NF3 | **Privacy** | Do **not** commit real `.env.local` or secrets; use `server/.env.example` placeholders only. |
| NF4 | **Latency** | Audio upload + Gemini + Mongo typically a few seconds on good connectivity. |
| NF5 | **Language** | Mixed Urdu / English utterances supported in the Gemini system prompt. |
| NF6 | **Layout** | Mobile-first shell (~440px wide preview) with internal scroll where needed. |

---

## 7. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS CLIENT (React 19)                     │
│  Zustand + localStorage  ←→  Lists: debt / payables / sales     │
│  AuthGate · MobileShell · bilingual headers                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ multipart audio + JSON
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              NEXT.JS ROUTE HANDLERS (Node runtime)              │
│  /api/voice/record  ·  /api/voice/commit  ·  /api/voice/undo    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Google Gemini │     │ MongoDB Atlas   │     │ Twilio WhatsApp│
│ audio + JSON  │     │ customers,      │     │ (optional)     │
│ intent schema │     │ purchases       │     │ outbound sends │
└───────────────┘     └─────────────────┘     └─────────────────┘
```

`@khata/server` holds **Gemini client**, **voice-intent pipeline**, **Mongo repositories**, and shared **types**; the client imports it via `transpilePackages`.

---

## 8. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **App** | **Next.js 16** (App Router, Turbopack) | UI + API routes in one repo |
| **UI** | **React 19**, Tailwind CSS, Lucide, Sonner | Mobile-first screens |
| **State** | **Zustand** + `persist` (localStorage) | Contacts, debts, payables, sales, demo auth |
| **Voice / AI** | **Google Gemini** (`@google/genai`), `gemini-3-flash-preview` default | Audio → transcript + structured intent |
| **Database** | **MongoDB** (official driver) | Customers, purchases, indexes |
| **Messaging** | **Twilio** WhatsApp API | Welcome, receipt, bills summary |
| **Validation** | **Zod** | Intent and document shapes |
| **Monorepo** | **pnpm** workspaces | `client` + `server` packages |

---

## 9. Data Model

### Server (MongoDB)

- **`customers`** — name, optional `whatsappNumber` (unique when set), aliases, timestamps.  
- **`purchases`** — `customerId`, `kind` (`debt` | `cash` | `payment`), amount, items, settled flag, transcript notes.

Balance views aggregate from purchases (owed vs spent).

### Client (Zustand → `localStorage` key `khata.ledger.v1`)

- **`Contact`**, **`Debt`**, **`Payable`**, **`Sale`** — see `server/src/types.ts` and `client/lib/store/ledger-store.ts`.  
- Selectors group **open debts by contact** and **open payables by supplier** for cleaner list screens.

Voice success responses are **mirrored** into this store so the UI updates immediately after `/api/voice/record`.

---

## 10. API Reference

### `POST /api/voice/record`

- **Body:** `multipart/form-data` with field **`audio`** (e.g. `webm` / `m4a`).  
- **Behavior:** Runs `runVoiceIntent` — Gemini + Mongo + optional Twilio.  
- **Response:** `{ ok: true, data: VoiceIntentResult }` with `action`, `customer`, `purchase`, `balance`, `messaging`, `customerCreated`, disambiguation payloads when applicable.

### `POST /api/voice/commit`

- **Body:** `{ intent, customerId }` — used after the user picks one person from a **disambiguation** list.  
- **Response:** Same shape as record path for the committed intent.

### `POST /api/voice/undo`

- **Body:** `{ purchaseId }` (Mongo purchase `_id` hex).  
- **Behavior:** Deletes that purchase document (best-effort rollback after a bad match).

---

## 11. Getting Started

### Prerequisites

- **Node.js ≥ 20**  
- **pnpm ≥ 9** (`packageManager` is pinned in root `package.json`)  
- **Google Gemini API key** — [Google AI Studio](https://aistudio.google.com/apikey)  
- **MongoDB Atlas** — [cloud.mongodb.com](https://cloud.mongodb.com)  
- **Twilio** (optional) — [console.twilio.com](https://console.twilio.com) for WhatsApp sandbox or production sender  

### Install

```bash
git clone https://github.com/shahmeerabdul/micathon-26.git
cd micathon-26
pnpm install
```

### Environment

Copy the template and fill in **real** values locally (never commit secrets):

```bash
cp server/.env.example client/.env.local
```

Edit **`client/.env.local`** — Next.js loads env from the **client** app root. Variables are documented in **`server/.env.example`** (placeholders only in git):

- `GEMINI_API_KEY`, `GEMINI_MODEL`  
- `MONGODB_URI`, `MONGODB_DB`, optional `MONGODB_DNS_SERVERS`  
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_ENABLED`  

### Run

```bash
pnpm dev
```

Open **http://localhost:3000** — allow the microphone when prompted.

### Build

```bash
pnpm build
pnpm start
```

---

## 12. Project Structure

```
Micathon-26/
├── pnpm-workspace.yaml
├── package.json
├── client/                              # @khata/client — Next.js app
│   ├── app/
│   │   ├── page.tsx                     # Home dashboard
│   │   ├── login/                       # Demo login
│   │   ├── record/
│   │   │   ├── page.tsx                 # Hold-to-record
│   │   │   ├── choose/page.tsx          # Name disambiguation
│   │   │   ├── confirm/page.tsx         # Alternate confirm flow
│   │   │   └── receipt/page.tsx         # Post-voice receipt + WhatsApp
│   │   ├── api/voice/
│   │   │   ├── record/route.ts
│   │   │   ├── commit/route.ts
│   │   │   └── undo/route.ts
│   │   ├── debt|payables|sales|activity|contacts|new|entry/…
│   │   ├── layout.tsx                   # AuthGate + shell
│   │   └── globals.css
│   ├── components/                      # Layout, dashboard, shared UI
│   ├── lib/
│   │   ├── store/                       # ledger-store, auth-store, selectors
│   │   ├── hooks/useAudioRecorder.ts
│   │   └── actions.ts                   # uploadVoiceAudio + mirror helpers
│   └── next.config.ts                   # transpilePackages: ["@khata/server"]
│
└── server/                              # @khata/server
    └── src/
        ├── types.ts
        ├── encryption.ts
        ├── env/load-env.ts
        ├── integrations/
        │   ├── gemini-client.ts
        │   └── twilio-client.ts
        ├── db/
        │   ├── mongo.ts
        │   ├── schemas.ts
        │   ├── customers.ts
        │   └── purchases.ts
        ├── actions/voice-intent.ts
        └── index.ts
```

---

## 13. Hackathon Compliance

- **No extra hardware** — browser on a phone or laptop.  
- **Defensible AI** — Gemini turns noisy vernacular audio into structured financial intents with guardrails and Mongo writes.  
- **Focused scope** — *khata* for customers and suppliers, not a full neobank.  
- **Inclusive** — Urdu/English voice and bilingual UI cues.

---

## 14. Roadmap

- Encrypted multi-device sync (vault types already exist in `@khata/server`).  
- Stronger auth than demo login.  
- Deeper reconciliation between Mongo history and local ledger.  
- SMS / UPI-style reminders where regulations allow.

---

## 15. Repositories & Team

| Repo | URL |
|---|---|
| **Primary (this fork)** | [github.com/shahmeerabdul/micathon-26](https://github.com/shahmeerabdul/micathon-26) |
| **Team upstream** | [github.com/ZuhaibAkhtarKhan/Micathon-26](https://github.com/ZuhaibAkhtarKhan/Micathon-26) |

Built for **Micathon '26**.

---

*"The best technology disappears. For a shopkeeper with a paper ledger, the best app is the one that feels like talking."*
