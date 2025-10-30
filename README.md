# Sphere3D Participant Roster

This project exposes a small REST API and companion single-page interface to manage participant rosters by department and generate draw results.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm start
   ```

   The API (and bundled front end) will be served from [http://localhost:3000](http://localhost:3000).

## Available endpoints

All endpoints live under `/api`.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| `GET` | `/api/roster` | Retrieve the current list of departments and participants. |
| `POST` | `/api/departments` | Create a new department. Body: `{ "name": "Marketing" }`. |
| `PUT` | `/api/departments/:id` | Update a department name and/or participant list. |
| `POST` | `/api/import` | Import participants from CSV for an existing or new department. Body: `{ csvText, departmentId?, departmentName?, mode? }`. |
| `POST` | `/api/reset` | Reset all departments, participants, and draw results. |
| `GET` | `/api/draw` | Retrieve the latest draw results. |
| `POST` | `/api/draw` | Generate a fresh draw using all participants. |

### CSV format

The CSV parser expects a `name` column and optionally an `email` column. If a header row is omitted, the first column is treated as the participant name and the second as the email.

### Draw logic

A draw collects every participant across all departments, shuffles them, and emits pairings. If there is an odd number of participants, the final entry will appear as a single unmatched participant in the results.

## Front-end interactions

The supplied UI (served from `/`) calls the API to:

- Add departments.
- Import CSV rosters with replace/append modes.
- Reset all stored data.
- Trigger new draws and render the latest results.

Data is persisted to `server/data/state.json`.
