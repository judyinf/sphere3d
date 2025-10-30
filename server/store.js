const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const dataDir = path.join(__dirname, 'data');
const statePath = path.join(dataDir, 'state.json');

const defaultSettings = Object.freeze({
  durationSeconds: 10,
  stopMode: 'auto',
  participantsPerDraw: 3,
  musicMuted: false
});

const defaultState = Object.freeze({
  departments: [],
  settings: defaultSettings,
  drawResults: {
    timestamp: null,
    winners: []
  },
  drawHistory: []
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
    return hydrateState(parsed);
  } catch (error) {
    console.warn('Failed to read persisted state, using defaults.', error);
    return clone(defaultState);
  }
}

function hydrateState(parsed) {
  const departments = Array.isArray(parsed.departments)
    ? parsed.departments.map(hydrateDepartment)
    : [];

  const settings = sanitizeSettings(parsed.settings);

  const drawHistory = Array.isArray(parsed.drawHistory)
    ? parsed.drawHistory.map(hydrateHistoryEntry).filter(Boolean)
    : [];

  const drawResults = hydrateDrawResults(parsed.drawResults, drawHistory);

  return {
    departments,
    settings,
    drawResults,
    drawHistory
  };
}

function hydrateDepartment(department) {
  const safeName = (() => {
    try {
      return ensureDepartmentName(department && department.name ? department.name : '');
    } catch (error) {
      return 'Department';
    }
  })();

  const participants = Array.isArray(department && department.participants)
    ? department.participants.map((participant) => ensureParticipant(participant, { keepDrawn: true }))
    : [];

  return {
    id: department && department.id ? String(department.id) : createId(),
    name: safeName,
    participants
  };
}

function hydrateDrawResults(drawResults, history) {
  if (drawResults && Array.isArray(drawResults.winners)) {
    return {
      timestamp: drawResults.timestamp ? new Date(drawResults.timestamp).toISOString() : null,
      winners: drawResults.winners.map(hydrateWinner).filter(Boolean)
    };
  }

  if (drawResults && Array.isArray(drawResults.pairs)) {
    const winners = drawResults.pairs
      .flat()
      .filter(Boolean)
      .map((participant) => hydrateWinner({
        participantId: participant.participantId || participant.id,
        name: participant.name,
        email: participant.email,
        departmentId: participant.departmentId,
        departmentName: participant.departmentName
      }))
      .filter(Boolean);

    const timestamp = drawResults.timestamp || (history[0] ? history[0].timestamp : null);

    return {
      timestamp,
      winners
    };
  }

  return clone(defaultState.drawResults);
}

function hydrateHistoryEntry(entry) {
  if (!entry || !Array.isArray(entry.winners) || !entry.winners.length) {
    return null;
  }

  return {
    id: entry.id || createId(),
    timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
    winners: entry.winners.map(hydrateWinner).filter(Boolean)
  };
}

function hydrateWinner(winner) {
  if (!winner) {
    return null;
  }

  const name = typeof winner.name === 'string' ? winner.name.trim() : '';
  if (!name) {
    return null;
  }

  const email = winner.email ? String(winner.email).trim() : null;

  return {
    participantId: winner.participantId || winner.id || createId(),
    name,
    email: email || null,
    departmentId: winner.departmentId || null,
    departmentName: winner.departmentName ? String(winner.departmentName).trim() : ''
  };
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

function ensureParticipant(participant, { keepDrawn = false } = {}) {
  if (!participant || typeof participant !== 'object') {
    throw new Error('Participant payload must be an object.');
  }

  const name = typeof participant.name === 'string' ? participant.name.trim() : '';
  if (!name) {
    throw new Error('Participant name is required.');
  }

  const email = participant.email ? String(participant.email).trim() : null;
  const drawn = keepDrawn && typeof participant.drawn === 'boolean' ? participant.drawn : false;

  return {
    id: participant.id || participant.participantId || createId(),
    name,
    email: email || null,
    drawn
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

function getSettings() {
  return clone(state.settings);
}

function updateSettings(partial = {}) {
  const next = sanitizeSettings({ ...state.settings, ...partial });
  state.settings = next;
  persistState();
  return getSettings();
}

function sanitizeSettings(settings = {}) {
  const sanitized = clone(defaultSettings);

  const duration = Number(settings.durationSeconds);
  if (Number.isFinite(duration) && duration > 0) {
    sanitized.durationSeconds = Math.min(Math.round(duration), 600);
  }

  const participants = Number(settings.participantsPerDraw);
  if (Number.isFinite(participants) && participants > 0) {
    sanitized.participantsPerDraw = Math.min(Math.round(participants), 1000);
  }

  const stopMode = settings.stopMode === 'manual' ? 'manual' : 'auto';
  sanitized.stopMode = stopMode;

  sanitized.musicMuted = Boolean(settings.musicMuted);

  return sanitized;
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
    throw new Error(`Department "${departmentName}" already exists.`);
  }

  const department = {
    id: createId(),
    name: departmentName,
    participants: participants.map((participant) => ensureParticipant(participant))
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
    department.participants = updates.participants.map((participant) =>
      ensureParticipant(participant, { keepDrawn: Boolean(participant.drawn) })
    );
  }

  persistState();
  return clone(department);
}

function parseSingleDepartmentCsv(csvText) {
  const lines = normalizeCsvLines(csvText);
  if (!lines.length) {
    throw new Error('CSV file did not contain any rows.');
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
  const potentialNameHeaders = ['name', 'participant', 'participant name'];
  let nameIndex = headers.findIndex((header) => potentialNameHeaders.includes(header));

  let dataStartIndex = 0;

  if (nameIndex === -1) {
    nameIndex = 0;
  } else {
    dataStartIndex = 1;
  }

  const emailIndex = headers.indexOf('email');

  const participants = [];

  for (let i = dataStartIndex; i < lines.length; i += 1) {
    const columns = splitCsvLine(lines[i]);
    const name = columns[nameIndex] ? columns[nameIndex].trim() : '';
    if (!name) {
      continue;
    }
    const email = emailIndex !== -1 && columns[emailIndex] ? columns[emailIndex].trim() : null;
    participants.push(ensureParticipant({ name, email }));
  }

  if (!participants.length) {
    throw new Error('No participants were found in the CSV data.');
  }

  return participants;
}

function parseMultiDepartmentCsv(csvText) {
  const lines = normalizeCsvLines(csvText);
  if (!lines.length) {
    throw new Error('CSV file did not contain any rows.');
  }

  const headerColumns = splitCsvLine(lines[0]);
  const departments = headerColumns
    .map((value, index) => ({ name: value ? value.trim() : '', index }))
    .filter(({ name }) => name.length > 0);

  if (!departments.length) {
    throw new Error('CSV header must contain department names.');
  }

  const participantsByDepartment = new Map();
  departments.forEach(({ name }) => {
    participantsByDepartment.set(name, []);
  });

  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const columns = splitCsvLine(lines[rowIndex]);

    departments.forEach(({ name, index }) => {
      const raw = columns[index] ? columns[index].trim() : '';
      if (!raw) {
        return;
      }

      const parsed = parseNameAndEmail(raw);
      participantsByDepartment.get(name).push(ensureParticipant(parsed));
    });
  }

  return participantsByDepartment;
}

function parseNameAndEmail(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }

  const pipeSplit = trimmed.split('|');
  if (pipeSplit.length === 2) {
    return { name: pipeSplit[0].trim(), email: pipeSplit[1].trim() };
  }

  return { name: trimmed };
}

function normalizeCsvLines(csvText) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    throw new Error('CSV content is required.');
  }

  return csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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

function applyParticipantsToDepartment(department, participants, mode) {
  const normalizedMode = mode === 'append' ? 'append' : 'replace';
  const prepared = participants.map((participant) => ({ ...participant, drawn: false }));

  if (normalizedMode === 'replace') {
    department.participants = prepared;
    return;
  }

  const existingByKey = new Map();
  department.participants.forEach((participant) => {
    existingByKey.set(createParticipantKey(participant), participant);
  });

  prepared.forEach((participant) => {
    const key = createParticipantKey(participant);
    if (!existingByKey.has(key)) {
      department.participants.push(participant);
      existingByKey.set(key, participant);
    }
  });
}

function createParticipantKey(participant) {
  return (participant.email ? participant.email.toLowerCase() : participant.name.toLowerCase());
}

function importCsv({ csvText, departmentId, departmentName, mode = 'replace', multiDepartment = false }) {
  const normalizedMode = mode === 'append' ? 'append' : 'replace';

  if (multiDepartment || (!departmentId && !departmentName)) {
    const participantsByDepartment = parseMultiDepartmentCsv(csvText);

    if (!participantsByDepartment.size) {
      throw new Error('The CSV did not contain any departments.');
    }

    participantsByDepartment.forEach((participants, name) => {
      const existing = findDepartmentByName(name);
      let departmentReference = existing;

      if (!departmentReference) {
        const created = addDepartment(name);
        departmentReference = findDepartmentById(created.id);
      }

      if (!departmentReference) {
        return;
      }

      applyParticipantsToDepartment(departmentReference, participants, normalizedMode);
    });

    persistState();
    return getRoster();
  }

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

  const participants = parseSingleDepartmentCsv(csvText);
  applyParticipantsToDepartment(department, participants, normalizedMode);

  persistState();
  return clone(department);
}

function reset() {
  state = clone(defaultState);
  persistState();
  return {
    roster: getRoster(),
    settings: getSettings(),
    drawResults: getDrawResults(),
    history: getHistory()
  };
}

function getDrawResults() {
  return clone(state.drawResults);
}

function getAvailableParticipants() {
  const available = [];

  state.departments.forEach((department) => {
    department.participants.forEach((participant) => {
      if (!participant.drawn) {
        available.push({ department, participant });
      }
    });
  });

  return available;
}

function createDraw() {
  const available = getAvailableParticipants();

  if (!available.length) {
    throw new Error('All participants have already been drawn. Reset to start over.');
  }

  const targetCount = Math.max(1, Math.min(state.settings.participantsPerDraw, available.length));
  const winnersPool = sample(available, targetCount);

  const winners = winnersPool.map(({ department, participant }) => {
    participant.drawn = true;
    return {
      participantId: participant.id,
      name: participant.name,
      email: participant.email,
      departmentId: department.id,
      departmentName: department.name
    };
  });

  const timestamp = new Date().toISOString();
  state.drawResults = { timestamp, winners };
  state.drawHistory.unshift({ id: createId(), timestamp, winners: clone(winners) });

  persistState();
  return getDrawResults();
}

function getHistory() {
  return clone(state.drawHistory);
}

function exportHistory() {
  const history = getHistory();
  const header = ['timestamp', 'participant', 'department', 'email'];
  const rows = history.flatMap((entry) =>
    entry.winners.map((winner) => [entry.timestamp, winner.name, winner.departmentName, winner.email || ''])
  );

  const csvRows = [header, ...rows].map((columns) =>
    columns
      .map((value) => {
        const safe = value === null || value === undefined ? '' : String(value);
        const escaped = safe.replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(',')
  );

  return csvRows.join('\n');
}

function sample(list, count) {
  const shuffled = shuffle(list);
  return shuffled.slice(0, count);
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
  getSettings,
  updateSettings,
  addDepartment,
  updateDepartment,
  importCsv,
  reset,
  getDrawResults,
  createDraw,
  getHistory,
  exportHistory
};
