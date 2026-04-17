# Voice-Activated Vernacular Ledger (Digital "Khata")

> A voice-first FinTech prototype that lets shopkeepers track sales, credit (*udhaar*), and inventory by simply speaking in **Urdu** or **Pashto** — no typing, no English, no forms.

Built for **Micathon '26 — "Money Moves"**.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target Audience](#3-target-audience)
4. [Core User Journey](#4-core-user-journey)
5. [Functional Requirements](#5-functional-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [System Architecture](#7-system-architecture)
8. [Technology Stack](#8-technology-stack)
9. [Data Model](#9-data-model)
10. [API Reference](#10-api-reference)
11. [Getting Started](#11-getting-started)
12. [Project Structure](#12-project-structure)
13. [Hackathon Compliance](#13-hackathon-compliance)
14. [Roadmap](#14-roadmap)
15. [Team](#15-team)

---

## 1. Executive Summary

The **Voice-Activated Vernacular Ledger** is a highly focused FinTech prototype designed to remove the **literacy** and **language** barriers that keep millions of small-business owners off digital financial tools.

Instead of forcing users to navigate English menus, typed forms, and complex category pickers, the app reduces the entire bookkeeping experience to a **single button and a spoken sentence**. An AI parsing layer converts messy, mixed-language speech into clean, structured financial records.

The result: a shopkeeper who cannot read English — or read at all — can still run a fully digital ledger of income, credit, and inventory in seconds after each transaction.

---

## 2. Problem Statement

Existing budgeting and accounting apps assume:

- The user can read and write English (or formal Urdu).
- The user can navigate dropdowns, tabs, and category pickers.
- The user has time to manually enter each line item.

This excludes the **largest retail demographic in South Asia**: local kiryana stores, tea stalls, and street vendors who operate almost entirely on **paper ledgers** and **verbal credit**.

The consequences are real and measurable:

- **Lost revenue** from forgotten or untracked *udhaar*.
- **Stockouts** because inventory is never reconciled.
- **No financial history** → no access to credit, insurance, or digital payments.

---

## 3. Target Audience

| Persona | Description |
|---|---|
| **Primary** | Kiryana store owners, small shopkeepers, and street vendors in Pakistan. |
| **Literacy** | Low-to-none English literacy; often low native-language literacy. |
| **Device** | Entry-level Android smartphone with intermittent 3G/4G. |
| **Moment of use** | Immediately after a customer transaction — typically 2–5 seconds of speech. |

---

## 4. Core User Journey

Imagine Ahmed buys 2 kg of sugar on credit for Rs. 500.

1. Shopkeeper taps and holds the **microphone button**.
2. Says in Urdu: *"Ahmed ko paanch sau ka udhaar, do kilo chini."*
3. Releases the button. Audio is transcribed on-device via the Web Speech API.
4. Transcript is sent to the backend, which calls the LLM to produce structured JSON.
5. A new **ledger card** appears on screen with:
   - Customer: **Ahmed** (matched to existing profile via fuzzy matching)
   - Amount: **Rs. 500**
   - Type: **Credit (udhaar)**
   - Items: **Sugar × 2 kg**
6. Sugar stock is silently deducted by 2 kg.
7. If sugar stock drops below threshold → a pre-drafted WhatsApp message to the wholesaler is shown.
8. A toast appears: *"Saved. Tap to undo."*

Total time: **under 5 seconds**, zero text input.

---

## 5. Functional Requirements

| # | Requirement | Description |
|---|---|---|
| F1 | **Voice Capture** | A prominent hold-to-record microphone button captures vernacular audio. |
| F2 | **Audio Transcription** | Browser-based Speech-to-Text calibrated for `ur-PK` dialects (Urdu / Pashto / Roman Urdu mix). |
| F3 | **AI Intent Parsing** | Backend calls an LLM (Gemini / Groq) to extract strictly-typed JSON: `amount`, `customer`, `type`, `items`. |
| F4 | **Contextual Customer Recognition** | Known customer names are passed to the LLM as context. Fuzzy matching prevents duplicate profiles for mispronunciations (*Ahmad* vs *Ahmed*). |
| F5 | **Visual Ledger Management** | Parsed transactions render as timestamped cards on a scrollable daily ledger. |
| F6 | **Shadow Inventory Deduction** | A hidden inventory table auto-decrements stock based on recognized items. |
| F7 | **Automated Restock Triggers** | When stock falls below threshold, generate a WhatsApp-ready restock message draft. |
| F8 | **Visual Confirmation & Editing** | Every logged transaction shows a toast with Undo / Edit options. |

---

## 6. Non-Functional Requirements

| # | Attribute | Target |
|---|---|---|
| NF1 | **Frictionless Usability** | Operable by a user who cannot read. Icon-only UI, color-coded states. |
| NF2 | **Offline Resilience** | Full ledger accessible via `LocalStorage` even with no internet. |
| NF3 | **Data Privacy** | No sensitive financial data stored in plaintext on external servers. All user state held client-side in the MVP. |
| NF4 | **Low Latency** | Button release → ledger update in **< 3 seconds** on a typical mobile connection. |
| NF5 | **Linguistic Empathy** | Handles Roman Urdu + Pashto slang + English numbers mixed in the same sentence. |
| NF6 | **Mobile-first Responsiveness** | Optimized for 360 px wide screens; touch targets ≥ 44 px. |

---

## 7. System Architecture

```
┌────────────────────────────────────────────────────────────┐
│                  MOBILE BROWSER (CLIENT)                   │
│                                                            │
│  ┌──────────────┐    ┌───────────────┐   ┌──────────────┐  │
│  │ Mic Button   │───▶│ MediaRecorder │──▶│ Web Speech   │  │
│  │ (hold-to-    │    │  + Audio Blob │   │ API (ur-PK)  │  │
│  │  record)     │    └───────────────┘   └──────┬───────┘  │
│  └──────────────┘                               │          │
│                                                 ▼          │
│  ┌──────────────┐    ┌───────────────┐   ┌──────────────┐  │
│  │ Ledger UI    │◀───│ LocalStorage  │◀──│ Transcript   │  │
│  │ (cards +     │    │ (ledger,      │   │ (raw text)   │  │
│  │  toasts)     │    │  customers,   │   └──────┬───────┘  │
│  └──────────────┘    │  inventory)   │          │          │
│                      └───────────────┘          │          │
└─────────────────────────────────────────────────┼──────────┘
                                                  │
                                                  ▼  HTTPS
┌────────────────────────────────────────────────────────────┐
│               NEXT.JS ROUTE HANDLER (SERVER)               │
│                                                            │
│   POST /api/process-audio                                  │
│     │                                                      │
│     ▼                                                      │
│   ┌──────────────────────────────────────────────┐         │
│   │  Prompt Builder                              │         │
│   │  - Injects known customer names              │         │
│   │  - Injects known inventory items             │         │
│   │  - Enforces strict JSON schema               │         │
│   └──────────────┬───────────────────────────────┘         │
│                  ▼                                         │
│   ┌──────────────────────────────────────────────┐         │
│   │  LLM Provider (Google Gemini / Groq)         │         │
│   └──────────────┬───────────────────────────────┘         │
│                  ▼                                         │
│   ┌──────────────────────────────────────────────┐         │
│   │  JSON Validator + Fuzzy Matcher              │         │
│   └──────────────┬───────────────────────────────┘         │
│                  ▼                                         │
│          Structured Transaction JSON ────────────▶ Client  │
└────────────────────────────────────────────────────────────┘
```

---

## 8. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | Next.js 14+ (App Router) | Unified frontend + API runtime |
| **UI** | React 18, Tailwind CSS, shadcn/ui | Rapid, accessible, mobile-first UI |
| **Audio Capture** | `MediaRecorder` + `window.SpeechRecognition` | Free, zero-latency speech capture (`ur-PK`) |
| **API Layer** | Next.js Route Handlers | `/api/process-audio` orchestration |
| **AI / LLM** | Google Gemini API *(primary)* / Groq *(fallback)* | Vernacular transcript → structured JSON |
| **Fuzzy Matching** | `fuse.js` | Customer name deduplication |
| **Persistence** | Browser `LocalStorage` | Zero-backend MVP storage |
| **Styling Tokens** | Tailwind + CSS variables | Dark/light + color-coded transaction states |
| **Deployment** | Vercel | One-click deploy for the hackathon demo |

---

## 9. Data Model

All state lives client-side in `LocalStorage` under three keys:

### `ledger`
```json
[
  {
    "id": "txn_1729180000000",
    "timestamp": "2026-04-17T18:32:10.000Z",
    "rawTranscript": "Ahmed ko paanch sau ka udhaar, do kilo chini",
    "amount": 500,
    "currency": "PKR",
    "type": "credit",
    "customerId": "cust_ahmed_01",
    "items": [
      { "name": "sugar", "quantity": 2, "unit": "kg" }
    ]
  }
]
```

### `customers`
```json
[
  { "id": "cust_ahmed_01", "name": "Ahmed", "aliases": ["Ahmad"], "balance": 500 }
]
```

### `inventory`
```json
[
  { "sku": "sugar", "displayName": "Chini", "stock": 18, "unit": "kg", "threshold": 5 }
]
```

---

## 10. API Reference

### `POST /api/process-audio`

**Request body**
```json
{
  "transcript": "Ahmed ko paanch sau ka udhaar, do kilo chini",
  "knownCustomers": ["Ahmed", "Bilal", "Zainab"],
  "knownItems": ["sugar", "rice", "tea", "oil"]
}
```

**Response body**
```json
{
  "amount": 500,
  "currency": "PKR",
  "type": "credit",
  "customer": { "name": "Ahmed", "matched": true, "confidence": 0.97 },
  "items": [{ "name": "sugar", "quantity": 2, "unit": "kg" }],
  "warnings": []
}
```

**Error codes**
- `400` — empty or malformed transcript
- `422` — LLM response failed schema validation
- `502` — upstream LLM provider unavailable

---

## 11. Getting Started

### Prerequisites
- Node.js **≥ 20**
- npm or pnpm
- A Google Gemini API key (free tier works)

### Installation

```bash
git clone https://github.com/ZuhaibAkhtarKhan/Micathon-26.git
cd Micathon-26
npm install
```

### Environment variables

Create a `.env.local` file in the project root:

```bash
GEMINI_API_KEY=your_key_here
# Optional fallback
GROQ_API_KEY=your_key_here
```

### Run locally

```bash
npm run dev
```

Open **http://localhost:3000** on your phone (same Wi-Fi) or desktop. Grant microphone permission on first use.

### Build for production

```bash
npm run build
npm run start
```

---

## 12. Project Structure

```
Micathon-26/
├── app/
│   ├── (ledger)/
│   │   └── page.tsx              # Main ledger screen
│   ├── api/
│   │   └── process-audio/
│   │       └── route.ts          # LLM orchestration
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── MicButton.tsx             # Hold-to-record control
│   ├── LedgerCard.tsx            # Transaction card
│   ├── UndoToast.tsx
│   └── RestockAlert.tsx
├── lib/
│   ├── speech.ts                 # Web Speech API wrapper
│   ├── llm.ts                    # Gemini / Groq client
│   ├── storage.ts                # LocalStorage helpers
│   ├── fuzzy.ts                  # Customer name matching
│   └── prompt.ts                 # Prompt template builder
├── public/
├── .env.local.example
├── package.json
└── README.md
```

---

## 13. Hackathon Compliance

This project strictly adheres to the **Micathon '26 "Money Moves"** requirements:

- **No Hardware.** Runs entirely on the user's existing Android phone via the browser.
- **Defensible AI.** The LLM is not decorative — it performs a task (mixed-language, unstructured speech → structured financial JSON) that traditional rule-based logic genuinely cannot solve.
- **Hyper-Focused Scope.** No neobank sprawl. One screen, one button, one moment of friction solved end-to-end.
- **Inclusive by Design.** Explicitly serves a demographic that mainstream FinTech ignores.

---

## 14. Roadmap

**Post-hackathon direction** (not in MVP):

- SMS / IVR fallback for feature phones.
- Server-side encrypted sync across devices.
- Automated end-of-day summary via WhatsApp voice note.
- Credit-score generation from ledger history for micro-lending partners.
- Multi-shop mode for small chain owners.

---

## 15. Team

Built by Team Micathon '26.
Repository: [github.com/ZuhaibAkhtarKhan/Micathon-26](https://github.com/ZuhaibAkhtarKhan/Micathon-26)

---

*"The best technology disappears. For a shopkeeper with a paper ledger, the best app is the one that feels like talking."*
