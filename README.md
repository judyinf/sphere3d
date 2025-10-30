# Sphere3D Participant Roster

Sphere3D pairs an Express REST API with a lightweight single-page interface for managing multi-department participant lists and running immersive drawings with a 3D sphere visualization.

## Getting started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the combined API/UI server

   ```bash
   npm start
   ```

   Open [http://localhost:3000](http://localhost:3000) to access the control panel.

State is persisted to `server/data/state.json` so subsequent restarts keep roster data, draw settings, and history.

## API overview

All endpoints are rooted at `/api`.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| `GET` | `/api/roster` | Current departments and their participants (including whether each person has already been drawn). |
| `POST` | `/api/departments` | Create a department. Body: `{ "name": "Marketing" }`. |
| `PUT` | `/api/departments/:id` | Rename a department or replace its participant list. |
| `POST` | `/api/import` | Import participants from CSV. Supports multi-department files (see below). |
| `POST` | `/api/reset` | Restore default settings, clear history, and wipe all roster data. |
| `GET` | `/api/settings` | Retrieve draw configuration (duration, stop mode, participants per draw, background music preference). |
| `PUT` | `/api/settings` | Update draw configuration. |
| `GET` | `/api/draw` | Latest draw result (timestamp + winners). |
| `POST` | `/api/draw` | Perform a draw using current settings and mark winners as drawn. |
| `GET` | `/api/history` | Chronological list of every draw and its winners. |
| `GET` | `/api/history/export` | Export draw history as CSV. |

### CSV formats

- **Multi-department (recommended):** The first row lists department names. Each column under a department should contain one participant per line. Add emails using either `Name | email@example.com` or `Name <email@example.com>`.
- **Single department:** For backwards compatibility you can still import a CSV with `name` and optional `email` columns while providing `departmentId` or `departmentName` in the payload.

When importing with `mode: "append"`, only new participants (matched by email or name) are added. The `"replace"` mode overwrites the entire department list and resets drawn status for the affected entries.

### Draw logic

- Configure a custom duration and automatic/manual stop mode via `/api/settings` (or the UI form).
- Set how many participants should be selected per draw. Previously drawn participants are skipped until a reset occurs.
- Each draw records the winners with a timestamp and appends the entry to history.
- Draw history can be exported as CSV for archival or auditing.

## Front-end features

The interface served from `/` communicates exclusively through the API and provides:

- A control panel for duration, stop mode, participants-per-draw, and background-music mute toggle.
- Start/stop controls that spin participant names on a 3D sphere; automatic mode halts after the configured duration.
- Multi-department CSV import with replace/append modes and manual department creation.
- Real-time roster view that flags participants who have already been drawn.
- Persistent draw history with CSV export.
- Optional background music that fades in during a draw and can be muted globally.

All generated files (history export, UI state) are derived from the API responses, so no additional build tooling is required.
