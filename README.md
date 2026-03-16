# Smartsheet-Synchronized Project Dashboard

A sophisticated, high-performance web interface designed to mirror and extend **Smartsheet** functionality. This application provides a specialized UI for managing project plans and tasks, ensuring that all user interactions are seamlessly synchronized with an underlying Smartsheet ledger in real-time.

## 🎯 Project Objective

The goal of this project is to provide a dedicated, high-fidelity alternative to the Smartsheet native grid. It empowers users to manage project objectives, assign team members, and track progress through a custom-built dashboard, while maintaining Smartsheet as the centralized data repository. 

---

## 🚀 Key Features

- **High-Fidelity UI**: A modern, responsive interface designed for professional project management, featuring "Gantt-style" status markers and hierarchy support.
- **Real-Time Synchronization**: Instant bi-directional data flow between the custom dashboard and Smartsheet via a dedicated backend proxy.
- **Task Management Lifecycle**: Full support for creating, updating, and removing project tasks within their respective phases.
- **Team Coordination**: Integrated contact management allows for multi-user assignment using Smartsheet's native contact data.
- **Dynamic Data Resolution**: The system automatically adapts to changes in the Smartsheet schema (column names, options, and types) without manual reconfiguration.
- **Intelligent Performance**: Leverages server-side caching and client-side optimization to ensure a sub-second, interactive experience.

---

## 📂 Project Architecture

```text
.
├── client/                 # React Frontend & Design System
│   ├── src/
│   │   ├── App.js          # Main Dashboard Orchestrator
│   │   ├── components/     # Specialized UI (TaskModals, ContactSelect)
│   │   ├── utils/          # Business Logic & Data Transformers
│   │   └── api.real.js     # Production Service Client
│   └── styles.css          # Professional CSS Design System
│
├── server/                 # Node.js Backend Gateway
│   ├── index.js            # API Implementation & Route Orchestration
│   ├── smartsheet.js       # Custom REST API Client (Universal)
│   └── utils/              # Data Sanitization & Mapping Helpers
│
└── README.md               # Technical Overview & Guide
```

---

## 🛠️ Technical Implementation Highlights

- **Native REST API Layer**: Deep integration with the Smartsheet REST API v2.0. By implementing a custom REST client instead of using generic SDKs, the system achieves lower latency and precise control over complex cell types (Multi-Contact, Abstract Datetime).
- **Separation of Concerns**: The codebase is strictly modularized. Data transformation logic is decoupled from the UI, allowing for high testability and maintainability.
- **Dynamic Schema Mapping**: The backend intelligently resolves Smartsheet structure (Columns/Phases) by exact titles or IDs, making the integration robust against sheet modifications.
- **Advanced State Management**: Implements smart caching strategies to minimize API rate-limiting impacts while ensuring users always see the latest "Source of Truth."

---

## 🚀 Getting Started

### 1. Requirements
- **Node.js**: v18.0 or higher.
- **Smartsheet**: API Developer Token and a Project Sheet.

### 2. Backend Installation
```bash
cd server
npm install
# Configure .env with your SMARTSHEET_TOKEN and SHEET_ID
npm start
```

### 3. Frontend Installation
```bash
cd client
npm install
# Point REACT_APP_API_BASE to your backend service
npm start
```

---

## ☁️ Deployment Reference

- **Backend**: Optimized for deployment on **Render** (via standard Node.js environment).
- **Frontend**: Optimized for **Netlify** (via production build output `build/`).

---

## 🧭 Roadmap

- Role-Based Access Control (RBAC) for specific task segments.
- Collaborative commenting and discussion thread integration.
- Advanced project health diagnostics and cross-sheet reporting.

---

## 📝 License

Internal Project Repository. Not for unauthorized distribution.
