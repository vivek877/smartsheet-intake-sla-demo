# Customer Request Intake & SLA Tracker

A small, Smartsheet‑style demo that mirrors the flow:
**intake → grid (rows/columns) → automation → visibility**.

The app showcases:
- **Centralized request intake** with CRUD
- **Grid experience** (search, filters, sort, pagination)
- **Per‑row collaboration** (comments & audit trail)
- **SLA automation**: `High + Open + past‑due ⇒ Escalated`
- **Visibility** via summary cards (Open / In‑Progress / Resolved / Escalated, **Due Today**, **Breached**)

> Built with **React + TypeScript (Vite)**, **Node.js + Express (TypeScript)**, and **MongoDB Atlas**.  
> Deployable on **Netlify (client)** + **Render (API)** free tiers.

---

## ✨ Screens / UX Highlights

- **Header + CTA**: App title and **“+ New Request”**.
- **Summary cards**: Open, In‑Progress, Resolved, Escalated, and **Due Today / Breached**.
- **Toolbar**: Free‑text **search**, **status**/**priority** filters, **assignee** filter, **sort** select.
- **Grid**: Title, Customer, Priority, Status (badge), Assignee, Due, and actions (**View**, **Quick Edit**, **Delete**).
- **New Request modal**: Create with validation (Customer, Title required).
- **Details modal**: Change **Status**, **Priority**, **Assignee**, **Due Date**; add **comment**; view last 10 **audit** entries.
- **SLA rule**: A minutely job escalates **High + Open + past‑due** items and records an **audit** entry.

---

## 📂 Monorepo Structure

```

.
├─ client/                 # React + TypeScript (Vite)
│  ├─ src/
│  │  ├─ App.tsx          # Main UI (grid, forms, details, stats)
│  │  ├─ api.ts           # REST client
│  │  ├─ types.ts         # Shared types
│  │  ├─ main.tsx         # App bootstrap
│  │  └─ styles.css       # Minimal dark theme
│  ├─ index.html
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ vite.config.ts
│
├─ server/                 # Node + Express (TypeScript)
│  ├─ src/
│  │  ├─ index.ts         # Express app, routes, cron schedule, wiring
│  │  ├─ lib/db.ts        # Mongo connection
│  │  ├─ models/Request.ts# Mongoose model (Request, Comments, Audit)
│  │  ├─ routes/
│  │  │  ├─ requests.ts   # CRUD + comments + CSV export
│  │  │  └─ stats.ts      # Summary counters
│  │  └─ jobs/sla.ts      # Minutely SLA auto-escalation
│  ├─ package.json
│  └─ tsconfig.json
│
├─ docs/
│  ├─ HLD.md              # High-level design (text)
│  └─ LLD.md              # Low-level design (text)
│
└─ README.md

````

---

## 🚀 Getting Started (Local)

### Prerequisites
- **Node.js 18+**
- **MongoDB Atlas** (free) – or a local Mongo instance

### 1) Backend (server)
```bash
cd server
cp .env.example .env           # Fill MONGODB_URI (Atlas URI)
npm i
npm run dev                    # Starts at http://localhost:4000
# Healthcheck: http://localhost:4000/health -> { ok: true }
````

> **Environment variables (server)**
>
> *   `MONGODB_URI` – e.g. `mongodb+srv://<user>:<pass>@cluster.mongodb.net/`
> *   `PORT` (optional, default `4000`)
> *   `ALLOWED_ORIGINS` (optional) – comma-separated list to restrict CORS in production

### 2) Frontend (client)

```bash
cd ../client
cp .env.example .env           # VITE_API_BASE=http://localhost:4000
npm i
npm run dev                    # Vite dev server (e.g., http://localhost:5173)
```

Open the client URL, click **+ New Request**, test CRUD, filters, comments, and watch the SLA auto‑escalation (set one **High + Open** with **yesterday** due date and wait \~1 min).

***

## ☁️ Deployment (Free)

### API → Render

*   **Root:** `server/`
*   **Build:** `npm ci && npm run build`
*   **Start:** `npm run start:prod`
*   **Env:** `MONGODB_URI` (Atlas), optionally `ALLOWED_ORIGINS`

Test after deploy:  
`https://<your-api>.onrender.com/health` → `{ ok: true }`

### Web → Netlify

*   **Base directory:** `client`
*   **Build command:** `npm run build`
*   **Publish directory:** `dist`
*   **Env (Site settings → Environment):**  
    `VITE_API_BASE = https://<your-api>.onrender.com`

> **Tighten CORS (optional):**  
> On Render, set `ALLOWED_ORIGINS=https://<your-netlify>.netlify.app` and use a restrictive CORS config in `server/src/index.ts`.

***

## 🔌 REST API (Summary)

> Base URL = `http://localhost:4000` (local) or Render API URL (prod)

**Requests**

*   `GET /api/requests?q=&status=&priority=&assignee=&from=&to=&page=&limit=&sort=`  
    List with search/filters/sort/pagination.
*   `POST /api/requests`  
    Create request.
*   `GET /api/requests/:id`  
    Get one.
*   `PATCH /api/requests/:id`  
    Update (appends **audit** diff).
*   `DELETE /api/requests/:id`  
    Delete.
*   `POST /api/requests/:id/comments`  
    Add a comment.
*   `GET /api/requests/export/csv`  
    Export all to CSV.

**Stats**

*   `GET /api/stats/summary`  
    `{ open, inProgress, resolved, escalated, dueToday, breached }`

**Health**

*   `GET /health`  
    `{ ok: true }`

***

## 🧠 Data Model (Mongo)

```ts
Request {
  _id: ObjectId;
  customer: string;
  title: string;
  description?: string;
  priority: 'Low'|'Medium'|'High';
  status: 'Open'|'In Progress'|'Resolved'|'Escalated';
  assignee?: string;
  dueDate?: Date;
  tags?: string[];
  attachments?: { name: string; url: string }[];
  comments?: { by: string; text: string; at: Date }[];
  audit?: { at: Date; by: string; action: string; diff?: any }[];
  createdAt: Date;
  updatedAt: Date;
}
```

***

## ⚙️ SLA Automation

A minutely job runs on the API.  
**Rule:** if `priority='High'` AND `status='Open'` AND `dueDate < now` ⇒ set `status='Escalated'` and append an audit entry `{ action: 'auto-escalate' }`.

***

## 🧪 Demo Flow

1.  Click **+ New Request**; create two rows (make one **High** with **yesterday** due date).
2.  Use **search/filters/sort**; try **Quick Edit** and **Delete**.
3.  Open **View**: change status/priority, add a **comment**, view the **audit** trail.
4.  Wait \~1 min — the high‑priority past‑due row escalates automatically.

***

## 🧰 Troubleshooting

*   **`Cannot GET /health` on Render:**
    *   Check **Root Directory** = `server`.
    *   Confirm **Build** = `npm ci && npm run build`, **Start** = `npm run start:prod`.
    *   Ensure **`MONGODB_URI`** is set and correct.
    *   Check logs for build/runtime errors.
*   **Client shows network errors:**
    *   Verify `VITE_API_BASE` on Netlify matches the **Render API URL**.
    *   If CORS issues: set `ALLOWED_ORIGINS` (Render) and restrict CORS accordingly.
*   **SLA not triggering:**
    *   Ensure one row is **High + Open** with **past** `dueDate`; wait at least **1 minute**.

***

## 📎 Documents

*   **UI Screens & CRUD Flow (PDF)** — attach for reviewers
*   **LLD (PDF)** — data model, endpoints, automation, deployment notes
*   **Presentation (PPTX)** — problem → solution → architecture → demo flow

> If you’re viewing this on GitHub, these files can be shared along with the repo in email to reviewers.

***

## 🧭 Roadmap (nice‑to‑have)

*   Authentication & RBAC
*   CSV **import** + Saved views (report‑like presets)
*   Role‑based UI (agent/manager)
*   Tighter CORS + rate limiting
*   Asset integration placeholders (e.g., DAM link field)

***

## 📝 License

This demo is provided **as‑is** for interview and evaluation purposes.

***

## 🙌 Acknowledgments

*   Built to reflect common **Smartsheet** customer scenarios: centralized intake, collaborative rows, and simple automation in support of SLAs.

```

---

### What next?
- Paste this into **`README.md`** at repo root, **commit**, and you’re ready to share the repo link in your email.
- If you want a tiny **“How to deploy on Render + Netlify”** section as a separate `DEPLOY.md`, say the word and I’ll generate it.
