const rosterContainer = document.getElementById('roster');
const historyContainer = document.getElementById('history-list');
const latestWinnersContainer = document.getElementById('latest-winners');
const sphereElement = document.getElementById('sphere');
const drawStatusElement = document.getElementById('draw-status');
const toast = document.getElementById('toast');

const addDepartmentForm = document.getElementById('add-department-form');
const departmentInput = document.getElementById('department-name');
const importForm = document.getElementById('import-form');
const csvInput = document.getElementById('csv-file');
const importModeSelect = document.getElementById('import-mode');

const settingsForm = document.getElementById('settings-form');
const durationInput = document.getElementById('duration-seconds');
const stopModeInputs = settingsForm.querySelectorAll('input[name="stop-mode"]');
const participantsInput = document.getElementById('participants-per-draw');
const musicToggle = document.getElementById('music-muted');

const startButton = document.getElementById('start-draw');
const stopButton = document.getElementById('stop-draw');
const resetButton = document.getElementById('reset-button');
const exportHistoryButton = document.getElementById('export-history');

let departments = [];
let settings = null;
let drawResults = null;
let history = [];
let availableParticipants = [];

let isDrawing = false;
let drawInFlight = false;
let stopTimer = null;
let saveSettingsTimeout = null;
let updatingSettingsForm = false;

const BASE_TILT_RAD = (15 * Math.PI) / 180;

let rotation = { x: 0, y: 0, z: 0 };
let rotationVelocity = { x: 0, y: 0.02, z: 0 };
let targetVelocity = { x: 0, y: 0.02, z: 0 };
let animationFrame = null;

class BackgroundMusic {
  constructor() {
    this.context = null;
    this.gain = null;
    this.oscillators = [];
    this.isMuted = false;
    this.isPlaying = false;
  }

  async ensureContext() {
    if (!this.context) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API not supported.');
      }
      this.context = new AudioCtx();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  async play() {
    if (this.isMuted || this.isPlaying) {
      return;
    }

    try {
      await this.ensureContext();
    } catch (error) {
      console.warn('Audio unavailable:', error);
      return;
    }

    const context = this.context;
    this.gain = context.createGain();
    this.gain.gain.setValueAtTime(0.0001, context.currentTime);
    this.gain.gain.exponentialRampToValueAtTime(0.03, context.currentTime + 1.5);
    this.gain.connect(context.destination);

    const frequencies = [196, 246.94, 311.13];
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      const localGain = context.createGain();
      localGain.gain.setValueAtTime(0.0001, context.currentTime);
      localGain.gain.exponentialRampToValueAtTime(0.25 / frequencies.length, context.currentTime + 2 + index * 0.25);
      oscillator.connect(localGain).connect(this.gain);
      oscillator.start(context.currentTime + index * 0.15);
      return { oscillator, localGain };
    });

    this.oscillators = oscillators;
    this.isPlaying = true;
  }

  stop() {
    if (!this.context || !this.isPlaying) {
      return;
    }

    const context = this.context;
    const now = context.currentTime;

    if (this.gain) {
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    }

    this.oscillators.forEach(({ oscillator }) => {
      try {
        oscillator.stop(now + 0.6);
      } catch (error) {
        /* noop */
      }
    });

    setTimeout(() => {
      this.oscillators = [];
      this.isPlaying = false;
    }, 800);
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    if (this.isMuted) {
      this.stop();
    }
  }
}

const backgroundMusic = new BackgroundMusic();

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
  renderSphere();
  updateDrawStatus();
}

async function loadSettings() {
  const data = await request('/api/settings');
  settings = data;
  renderSettings();
}

async function loadDrawResults() {
  const data = await request('/api/draw');
  drawResults = data;
  renderLatestWinners();
}

async function loadHistory() {
  const data = await request('/api/history');
  history = Array.isArray(data) ? data : [];
  renderHistory();
}

function renderSettings() {
  if (!settings) {
    return;
  }

  updatingSettingsForm = true;
  durationInput.value = settings.durationSeconds;
  participantsInput.value = settings.participantsPerDraw;
  musicToggle.checked = Boolean(settings.musicMuted);

  stopModeInputs.forEach((input) => {
    input.checked = input.value === settings.stopMode;
  });
  updatingSettingsForm = false;

  backgroundMusic.setMuted(settings.musicMuted);
  updateButtonStates();
}

function renderRoster() {
  rosterContainer.innerHTML = '';

  if (!departments.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No departments yet. Add one or import a CSV to get started.';
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
      empty.textContent = 'No participants yet.';
      section.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      department.participants.forEach((participant) => {
        const item = document.createElement('li');
        const label = participant.email ? `${participant.name} (${participant.email})` : participant.name;
        item.textContent = label;
        if (participant.drawn) {
          item.classList.add('drawn');
          item.title = 'Already drawn';
        }
        list.appendChild(item);
      });
      section.appendChild(list);
    }

    rosterContainer.appendChild(section);
  });
}

function renderSphere() {
  sphereElement.innerHTML = '';
  availableParticipants = [];

  departments.forEach((department) => {
    department.participants.forEach((participant) => {
      if (!participant.drawn) {
        availableParticipants.push({ department, participant });
      }
    });
  });

  if (!availableParticipants.length) {
    sphereElement.classList.add('sphere--empty');
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'All participants have been drawn.';
    sphereElement.appendChild(empty);
    updateButtonStates();
    return;
  }

  sphereElement.classList.remove('sphere--empty');

  const total = availableParticipants.length;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  availableParticipants.forEach(({ participant }, index) => {
    const y = 1 - (index / (total - 1 || 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = goldenAngle * index;

    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;

    const nameEl = document.createElement('div');
    nameEl.className = 'sphere-name';
    nameEl.textContent = participant.name;
    nameEl.style.setProperty('--tx', `${x * 150}px`);
    nameEl.style.setProperty('--ty', `${y * 150}px`);
    nameEl.style.setProperty('--tz', `${z * 150}px`);

    sphereElement.appendChild(nameEl);
  });

  startAnimation();
  updateButtonStates();
}

function renderLatestWinners() {
  latestWinnersContainer.innerHTML = '';

  if (!drawResults || !Array.isArray(drawResults.winners) || !drawResults.winners.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Run a draw to reveal the winners here.';
    latestWinnersContainer.appendChild(empty);
    return;
  }

  const timestamp = document.createElement('p');
  timestamp.className = 'timestamp';
  timestamp.textContent = `Last draw: ${new Date(drawResults.timestamp).toLocaleString()}`;
  latestWinnersContainer.appendChild(timestamp);

  const list = document.createElement('ol');
  list.className = 'winners';

  drawResults.winners.forEach((winner) => {
    const item = document.createElement('li');
    item.innerHTML = `<strong>${winner.name}</strong> <span>${winner.departmentName}${winner.email ? ` • ${winner.email}` : ''}</span>`;
    list.appendChild(item);
  });

  latestWinnersContainer.appendChild(list);
}

function renderHistory() {
  historyContainer.innerHTML = '';

  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No draws have been recorded yet.';
    historyContainer.appendChild(empty);
    return;
  }

  const list = document.createElement('ol');
  list.className = 'history';

  history.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'history-item';

    const header = document.createElement('div');
    header.className = 'history-item__header';
    header.innerHTML = `<time datetime="${entry.timestamp}">${new Date(entry.timestamp).toLocaleString()}</time>`;
    item.appendChild(header);

    const winnersList = document.createElement('ul');
    winnersList.className = 'history-item__winners';

    entry.winners.forEach((winner) => {
      const winnerItem = document.createElement('li');
      winnerItem.innerHTML = `<strong>${winner.name}</strong><span>${winner.departmentName}${winner.email ? ` • ${winner.email}` : ''}</span>`;
      winnersList.appendChild(winnerItem);
    });

    item.appendChild(winnersList);
    list.appendChild(item);
  });

  historyContainer.appendChild(list);
}

function updateDrawStatus() {
  if (!availableParticipants.length) {
    drawStatusElement.textContent = 'All participants have been drawn. Reset to start over or import more names.';
    return;
  }

  drawStatusElement.textContent = `${availableParticipants.length} participant${availableParticipants.length === 1 ? '' : 's'} ready for the next draw.`;
}

function setTargetVelocity(x, y, z = targetVelocity.z) {
  targetVelocity = { x, y, z };
}

function animateSphere() {
  rotationVelocity.x += (targetVelocity.x - rotationVelocity.x) * 0.08;
  rotationVelocity.y += (targetVelocity.y - rotationVelocity.y) * 0.08;
  rotationVelocity.z += (targetVelocity.z - rotationVelocity.z) * 0.08;

  rotation.x += rotationVelocity.x;
  rotation.y += rotationVelocity.y;
  rotation.z += rotationVelocity.z;

  sphereElement.style.transform =
    `rotateX(${BASE_TILT_RAD}rad) rotateZ(${rotation.z}rad) rotateX(${rotation.x}rad) rotateY(${rotation.y}rad)`;

  animationFrame = requestAnimationFrame(animateSphere);
}

function startAnimation() {
  if (animationFrame) {
    return;
  }
  animationFrame = requestAnimationFrame(animateSphere);
}

function stopAnimation() {
  if (!animationFrame) {
    return;
  }
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `show ${type}`;
  clearTimeout(showToast.hideTimeout);
  showToast.hideTimeout = setTimeout(() => {
    toast.className = '';
  }, 3000);
}

function updateButtonStates() {
  const hasParticipants = availableParticipants.length > 0;
  startButton.disabled = !hasParticipants || isDrawing || drawInFlight;
  stopButton.disabled = !isDrawing;
}

function queueSettingsSave() {
  clearTimeout(saveSettingsTimeout);
  saveSettingsTimeout = setTimeout(async () => {
    try {
      const payload = {
        durationSeconds: Number(durationInput.value),
        stopMode: settingsForm.elements['stop-mode'].value,
        participantsPerDraw: Number(participantsInput.value),
        musicMuted: musicToggle.checked
      };
      const updated = await request('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      settings = updated;
      renderSettings();
      showToast('Settings saved.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }, 250);
}

settingsForm.addEventListener('input', () => {
  if (updatingSettingsForm) {
    return;
  }
  queueSettingsSave();
});

settingsForm.addEventListener('change', () => {
  if (updatingSettingsForm) {
    return;
  }
  queueSettingsSave();
});

musicToggle.addEventListener('change', () => {
  if (settings) {
    settings.musicMuted = musicToggle.checked;
    backgroundMusic.setMuted(settings.musicMuted);
  }
});

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
  if (!file) {
    showToast('Please choose a CSV file.', 'error');
    return;
  }

  try {
    const csvText = await file.text();
    const payload = {
      csvText,
      mode: importModeSelect.value,
      multiDepartment: true
    };

    await request('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    importForm.reset();
    showToast('Roster updated from CSV.', 'success');
    await Promise.all([loadRoster(), loadHistory()]);
  } catch (error) {
    showToast(error.message, 'error');
  }
});

startButton.addEventListener('click', async () => {
  if (isDrawing || drawInFlight) {
    return;
  }

  if (!availableParticipants.length) {
    showToast('No participants are available for drawing.', 'error');
    return;
  }

  isDrawing = true;
  updateButtonStates();
  drawStatusElement.textContent =
    settings.stopMode === 'auto'
      ? `Drawing in progress. Automatically stopping in ${settings.durationSeconds} seconds...`
      : 'Drawing in progress. Press Stop Draw to reveal the winners.';

  setTargetVelocity(0.5, 0.85, 1);

  if (!settings.musicMuted) {
    await backgroundMusic.play();
  }

  if (settings.stopMode === 'auto') {
    stopTimer = setTimeout(() => {
      stopDraw({ auto: true }).catch((error) => console.error(error));
    }, settings.durationSeconds * 1000);
  }
});

stopButton.addEventListener('click', () => {
  stopDraw().catch((error) => console.error(error));
});

async function stopDraw({ auto = false } = {}) {
  if (!isDrawing && !drawInFlight) {
    return;
  }

  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }

  if (isDrawing) {
    drawStatusElement.textContent = auto ? 'Automatic stop triggered...' : 'Stopping draw...';
  }

  isDrawing = false;
  drawInFlight = true;
  updateButtonStates();
  setTargetVelocity(0, 0.05, 0);
  backgroundMusic.stop();

  try {
    const result = await request('/api/draw', { method: 'POST' });
    drawResults = result;
    showToast('Winners selected!', 'success');
    await Promise.all([loadRoster(), loadHistory()]);
    renderLatestWinners();
    updateDrawStatus();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    drawInFlight = false;
    updateButtonStates();
  }
}

resetButton.addEventListener('click', async () => {
  const confirmed = window.confirm(
    'This will erase all departments, participants, settings, and draw history. Continue?'
  );
  if (!confirmed) {
    return;
  }

  try {
    const data = await request('/api/reset', { method: 'POST' });
    departments = data.roster ? data.roster.departments || [] : [];
    settings = data.settings || settings;
    drawResults = data.drawResults || null;
    history = data.history || [];

    renderSettings();
    renderRoster();
    renderSphere();
    renderLatestWinners();
    renderHistory();
    updateDrawStatus();

    showToast('All data has been reset.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

exportHistoryButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/history/export');
    if (!response.ok) {
      throw new Error('Failed to export history.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `draw-history-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('History exported.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

(async function init() {
  try {
    await Promise.all([loadSettings(), loadRoster(), loadDrawResults(), loadHistory()]);
    setTargetVelocity(0, 0.025, 0);
    startAnimation();
    updateDrawStatus();
  } catch (error) {
    console.error(error);
    showToast('Failed to load initial data.', 'error');
  }
})();

window.addEventListener('beforeunload', () => {
  stopAnimation();
  backgroundMusic.stop();
});
