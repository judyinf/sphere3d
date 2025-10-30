const rosterContainer = document.getElementById('roster');
const drawContainer = document.getElementById('draw-results');
const addDepartmentForm = document.getElementById('add-department-form');
const departmentInput = document.getElementById('department-name');
const importForm = document.getElementById('import-form');
const csvInput = document.getElementById('csv-file');
const importDepartmentSelect = document.getElementById('import-department');
const importNewDepartmentInput = document.getElementById('import-new-department');
const importModeSelect = document.getElementById('import-mode');
const drawButton = document.getElementById('draw-button');
const resetButton = document.getElementById('reset-button');
const toast = document.getElementById('toast');

let departments = [];
let drawResults = null;

async function request(url, options = {}) {
  const { method = 'GET', headers, ...rest } = options;
  const config = {
    method,
    headers: headers || (method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    ...rest
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const message = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(message.error || 'Request failed');
  }

  return response.json();
}

async function loadRoster() {
  const data = await request('/api/roster');
  departments = data.departments || [];
  renderRoster();
  updateImportOptions();
}

async function loadDrawResults() {
  const data = await request('/api/draw');
  drawResults = data;
  renderDrawResults();
}

function renderRoster() {
  rosterContainer.innerHTML = '';
  if (!departments.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No departments yet. Add one to get started.';
    rosterContainer.appendChild(empty);
    return;
  }

  departments.forEach((department) => {
    const section = document.createElement('section');
    section.className = 'department';

    const heading = document.createElement('h3');
    heading.textContent = `${department.name} (${department.participants.length})`;
    section.appendChild(heading);

    if (!department.participants.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No participants imported yet.';
      section.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      department.participants.forEach((participant) => {
        const item = document.createElement('li');
        item.textContent = participant.email ? `${participant.name} (${participant.email})` : participant.name;
        list.appendChild(item);
      });
      section.appendChild(list);
    }

    rosterContainer.appendChild(section);
  });
}

function renderDrawResults() {
  drawContainer.innerHTML = '';
  if (!drawResults || !drawResults.pairs || !drawResults.pairs.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Run a draw to see pairings.';
    drawContainer.appendChild(empty);
    return;
  }

  if (drawResults.timestamp) {
    const timestamp = document.createElement('p');
    const date = new Date(drawResults.timestamp);
    timestamp.className = 'timestamp';
    timestamp.textContent = `Generated ${date.toLocaleString()}`;
    drawContainer.appendChild(timestamp);
  }

  const list = document.createElement('ol');
  drawResults.pairs.forEach((pair) => {
    const item = document.createElement('li');
    item.className = 'pair';
    if (pair.length === 2) {
      item.textContent = `${formatParticipant(pair[0])} ↔ ${formatParticipant(pair[1])}`;
    } else {
      item.textContent = `${formatParticipant(pair[0])} has no match`;
    }
    list.appendChild(item);
  });

  drawContainer.appendChild(list);
}

function formatParticipant(participant) {
  const base = participant.email ? `${participant.name} (${participant.email})` : participant.name;
  return `${base} – ${participant.departmentName}`;
}

function updateImportOptions() {
  const previous = importDepartmentSelect.value;
  importDepartmentSelect.innerHTML = '<option value="">-- Select --</option>';
  departments.forEach((department) => {
    const option = document.createElement('option');
    option.value = department.id;
    option.textContent = department.name;
    importDepartmentSelect.appendChild(option);
  });
  if (departments.some((dept) => dept.id === previous)) {
    importDepartmentSelect.value = previous;
  }
}

function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `show ${type}`;
  clearTimeout(showToast.hideTimeout);
  showToast.hideTimeout = setTimeout(() => {
    toast.className = '';
  }, 3000);
}

addDepartmentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = departmentInput.value.trim();
  if (!name) {
    showToast('Please enter a department name.', 'error');
    return;
  }

  try {
    await request('/api/departments', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    departmentInput.value = '';
    showToast('Department added.', 'success');
    await loadRoster();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

importForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = csvInput.files[0];
  const departmentId = importDepartmentSelect.value;
  const newDepartmentName = importNewDepartmentInput.value.trim();
  const mode = importModeSelect.value;

  if (!file) {
    showToast('Please choose a CSV file.', 'error');
    return;
  }

  if (!departmentId && !newDepartmentName) {
    showToast('Select an existing department or enter a new department name.', 'error');
    return;
  }

  try {
    const csvText = await file.text();
    const payload = { csvText, mode };
    if (departmentId) {
      payload.departmentId = departmentId;
    }
    if (newDepartmentName) {
      payload.departmentName = newDepartmentName;
    }
    await request('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    importForm.reset();
    showToast('Participants imported successfully.', 'success');
    await loadRoster();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

drawButton.addEventListener('click', async () => {
  try {
    drawResults = await request('/api/draw', { method: 'POST' });
    renderDrawResults();
    showToast('New draw generated.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

resetButton.addEventListener('click', async () => {
  const confirmed = window.confirm('This will delete all departments, participants, and draw results. Continue?');
  if (!confirmed) {
    return;
  }

  try {
    await request('/api/reset', { method: 'POST' });
    departments = [];
    drawResults = null;
    renderRoster();
    renderDrawResults();
    updateImportOptions();
    showToast('All data has been reset.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

(async function init() {
  try {
    await loadRoster();
    await loadDrawResults();
  } catch (error) {
    console.error(error);
    showToast('Failed to load initial data.', 'error');
  }
})();
