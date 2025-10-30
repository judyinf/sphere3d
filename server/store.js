const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const dataDir = path.join(__dirname, 'data');
const statePath = path.join(dataDir, 'state.json');

const defaultState = Object.freeze({
  departments: [],
  drawResults: {
    timestamp: null,
    pairs: []
  }
});

let state = loadState();

function loadState() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(statePath)) {
    const initialState = clone(defaultState);
    fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2));
    return initialState;
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      departments: Array.isArray(parsed.departments) ? parsed.departments : [],
      drawResults: parsed.drawResults || clone(defaultState.drawResults)
    };
  } catch (error) {
    console.warn('Failed to read persisted state, using defaults.', error);
    return clone(defaultState);
  }
}

function persistState() {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDepartmentName(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Department name is required.');
  }
  return name.trim();
}

function ensureParticipant(participant) {
  if (!participant || typeof participant !== 'object') {
    throw new Error('Participant payload must be an object.');
  }
  const name = typeof participant.name === 'string' ? participant.name.trim() : '';
  if (!name) {
    throw new Error('Participant name is required.');
  }
  const email = participant.email ? String(participant.email).trim() : null;
  return {
    id: participant.id || createId(),
    name,
    email: email || null
  };
}

function createId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getRoster() {
  return {
    departments: clone(state.departments)
  };
}

function findDepartmentById(id) {
  return state.departments.find((dept) => dept.id === id);
}

function findDepartmentByName(name) {
  const normalized = name.trim().toLowerCase();
  return state.departments.find((dept) => dept.name.trim().toLowerCase() === normalized);
}

function addDepartment(name, participants = []) {
  const departmentName = ensureDepartmentName(name);
  if (findDepartmentByName(departmentName)) {
    throw new Error(`Department \"${departmentName}\" already exists.`);
  }

  const department = {
    id: createId(),
    name: departmentName,
    participants: participants.map(ensureParticipant)
  };

  state.departments.push(department);
  persistState();
  return clone(department);
}

function updateDepartment(id, updates = {}) {
  const department = findDepartmentById(id);
  if (!department) {
    throw new Error('Department not found.');
  }

  if (updates.name !== undefined) {
    const newName = ensureDepartmentName(updates.name);
    const conflict = findDepartmentByName(newName);
    if (conflict && conflict.id !== department.id) {
      throw new Error(`Department "${newName}" already exists.`);
    }
    department.name = newName;
  }

  if (Array.isArray(updates.participants)) {
    department.participants = updates.participants.map(ensureParticipant);
  }

  persistState();
  return clone(department);
}

function parseCsv(csvText) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    throw new Error('CSV content is required.');
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error('CSV file did not contain any rows.');
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
  const headerHasName = headers.includes('name') || headers.includes('participant') || headers.includes('participant name');

  const rows = [];
  const startIndex = headerHasName ? 1 : 0;
  const nameIndex = headerHasName
    ? (() => {
        const potential = ['name', 'participant', 'participant name'];
        for (const key of potential) {
          const idx = headers.indexOf(key);
          if (idx !== -1) {
            return idx;
          }
        }
        return 0;
      })()
    : 0;

  const emailIndex = headerHasName ? headers.indexOf('email') : 1;

  const columnMappings = { name: nameIndex, email: emailIndex };

  for (let i = startIndex; i < lines.length; i += 1) {
    const columns = splitCsvLine(lines[i]);
    const name = columns[columnMappings.name] ? columns[columnMappings.name].trim() : '';
    const email = columnMappings.email !== -1 && columns[columnMappings.email]
      ? columns[columnMappings.email].trim()
      : '';
    if (!name) {
      continue;
    }
    rows.push(
      ensureParticipant({
        name,
        email
      })
    );
  }

  if (!rows.length) {
    throw new Error('No participants were found in the CSV data.');
  }

  return rows;
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0 || line.endsWith(',')) {
    result.push(current.trim());
  }

  return result;
}

function importCsv({ csvText, departmentId, departmentName, mode = 'replace' }) {
  const participants = parseCsv(csvText);
  let department = null;

  if (departmentId) {
    department = findDepartmentById(departmentId);
    if (!department) {
      throw new Error('Department not found.');
    }
  }

  if (!department && departmentName) {
    const existing = findDepartmentByName(departmentName);
    if (existing) {
      department = existing;
    } else {
      const created = addDepartment(departmentName, []);
      department = findDepartmentById(created.id);
    }
  }

  if (!department) {
    throw new Error('Specify an existing department or provide a department name.');
  }

  if (mode !== 'replace' && mode !== 'append') {
    throw new Error('Import mode must be either "replace" or "append".');
  }

  if (mode === 'replace') {
    department.participants = participants;
  } else {
    const existingByKey = new Map();
    department.participants.forEach((participant) => {
      const key = participant.email ? participant.email.toLowerCase() : participant.name.toLowerCase();
      existingByKey.set(key, participant);
    });

    participants.forEach((participant) => {
      const key = participant.email ? participant.email.toLowerCase() : participant.name.toLowerCase();
      if (!existingByKey.has(key)) {
        department.participants.push(participant);
        existingByKey.set(key, participant);
      }
    });
  }

  persistState();
  return clone(department);
}

function reset() {
  state = clone(defaultState);
  persistState();
  return getRoster();
}

function getDrawResults() {
  return clone(state.drawResults);
}

function createDraw() {
  const participants = state.departments.flatMap((department) =>
    department.participants.map((participant) => ({
      participantId: participant.id,
      name: participant.name,
      email: participant.email,
      departmentId: department.id,
      departmentName: department.name
    }))
  );

  const shuffled = shuffle(participants);
  const pairs = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    const first = shuffled[i];
    const second = shuffled[i + 1];
    if (first && second) {
      pairs.push([first, second]);
    } else if (first) {
      pairs.push([first]);
    }
  }

  state.drawResults = {
    timestamp: new Date().toISOString(),
    pairs
  };

  persistState();
  return getDrawResults();
}

function shuffle(list) {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

module.exports = {
  getRoster,
  addDepartment,
  updateDepartment,
  importCsv,
  reset,
  getDrawResults,
  createDraw
};
