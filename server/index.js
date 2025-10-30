const express = require('express');
const cors = require('cors');
const path = require('path');
const store = require('./store');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/roster', (req, res) => {
  try {
    const roster = store.getRoster();
    res.json(roster);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', (req, res) => {
  try {
    res.json(store.getSettings());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const settings = store.updateSettings(req.body || {});
    res.json(settings);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/departments', (req, res) => {
  try {
    const { name } = req.body || {};
    const department = store.addDepartment(name);
    res.status(201).json(department);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/departments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const department = store.updateDepartment(id, updates);
    res.json(department);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/import', (req, res) => {
  try {
    const result = store.importCsv(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/reset', (req, res) => {
  try {
    const data = store.reset();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/draw', (req, res) => {
  try {
    const results = store.getDrawResults();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/draw', (req, res) => {
  try {
    const results = store.createDraw();
    res.json(results);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/history', (req, res) => {
  try {
    const history = store.getHistory();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/history/export', (req, res) => {
  try {
    const csv = store.exportHistory();
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', 'attachment; filename="draw-history.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
