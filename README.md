# Smartsheet Project Intake & SLA Tracker

A high-performance project management dashboard and intake system integrated directly with the **Smartsheet REST API**. This solution provides an executive-level interface for managing project plans, tracking SLAs, and coordinating team assignments.

## 🚀 Key Features

- **Direct Smartsheet Integration**: Real-time synchronization with Smartsheet using a native REST API client.
- **Dynamic Task Management**: Full CRUD operations for project tasks with hierarchy support (Phases/Sub-tasks).
- **Intelligent Caching**: Advanced server-side caching to ensure sub-second response times for the frontend dashboard.
- **Team Collaboration**: Integrated contact management for multi-user task assignments.
- **Executive Dashboard**: Clean, responsive UI featuring search, filtering, and "Gantt-style" status indicators.
- **Automation Support**: Server-side logic to handle complex Smartsheet object values (Multi-Contact, Abstract Datetime).

---

## 📂 Project Structure

```text
.
├── client/                 # React Frontend (Create React App)
│   ├── src/
│   │   ├── App.js          # Main Dashboard & State Logic
│   │   ├── api.real.js     # Production API Service Client
│   │   └── components/     # UI Components (Collaborative Multi-select, etc.)
│   └── .env                # Local Environment Configuration
│
├── server/                 # Node.js Backend (Express)
│   ├── index.js            # API Gateway, Caching, and Route Orchestration
│   ├── smartsheet.js       # Specialized Smartsheet REST Client
│   └── .env                # API Security & Sheet Configuration
│
└── README.md               # Deployment & Documentation
```

---

## 🛠️ Technology Stack

- **Frontend**: React, Vanilla CSS (Modern UI/UX), Lucide Icons.
- **Backend**: Node.js, Express.
- **External API**: Smartsheet REST API v2.0.
- **Utilities**: Dotenv, CORS, Morgan (Request Logging).

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: Version 18.0 or higher.
- **Smartsheet**: An active API Developer Token and a Project Sheet ID.

### 2. Backend Setup (`/server`)
```bash
cd server
npm install
# Create .env with the following:
SMARTSHEET_TOKEN=your_token_here
SHEET_ID=your_sheet_id_here
PORT=8080
npm start
```
*Health Check*: `http://localhost:8080/health` should return `{ "ok": true }`.

### 3. Frontend Setup (`/client`)
```bash
cd client
npm install
# Create .env with the following:
REACT_APP_API_BASE=http://localhost:8080
npm start
```
*Dashoard*: Once both services are active, the dashboard will mount at `http://localhost:3000`.

---

## ☁️ Deployment Guide

### Professional Production Deployment (Recommended)

1.  **Backend (Render.com)**:
    - Root Directory: `server`
    - Build Command: `npm install`
    - Start Command: `node index.js`
    - Env Variables: `SMARTSHEET_TOKEN`, `SHEET_ID`, `ALLOWED_ORIGIN` (Your Netlify URL).

2.  **Frontend (Netlify)**:
    - Base Directory: `client`
    - Build Command: `npm run build`
    - Publish Directory: `build`
    - Env Variables: `REACT_APP_API_BASE` (Your Render URL).

---

## 🧠 Architecture Overview (Senior Highlights)

- **Native REST Client**: Bypassed legacy SDKs to implement a custom, transparent REST client. This ensures 100% control over the payload and eliminates "black box" library errors.
- **Smart Data Resolution**: The server intelligently resolves sheets by ID or exact Name, providing enterprise-grade flexibility.
- **State Sanitization**: Automatic mapping of Smartsheet's complex cell structures into a flat, predictable JSON format for high-speed frontend rendering.
- **SLA Reliability**: Implemented robust error handling to prevent service downtime during Smartsheet API rate limits or network fluctuations.

---

## 🧭 Future Roadmap

- Role-Based Access Control (RBAC) via JWT.
- Integrated Audit Trail view per task.
- Automated SLA status escalation jobs.
- CSV Export functionality.

---

## 📝 License

Internal Demo use only. Not for public redistribution.
