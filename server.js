const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const multer = require('multer');

// Configure multer for file uploads (memory storage for Excel files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

// Data persistence paths
const DATA_DIR = path.join(__dirname, 'data');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');

// Load categories from JSON file on startup
// Returns { rounds, activeRoundIndex } structure
function loadCategories() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(CATEGORIES_FILE)) {
      const data = fs.readFileSync(CATEGORIES_FILE, 'utf8');
      const parsed = JSON.parse(data);

      // Check if it's old format (array of categories) or new format (object with rounds)
      if (Array.isArray(parsed)) {
        // Migrate old format to new format
        console.log(`[${new Date().toISOString()}] Migrating old categories format to rounds format`);
        const rounds = parsed.length > 0 ? [{ name: 'Round 1', categories: parsed }] : [];
        console.log(`[${new Date().toISOString()}] Loaded ${rounds.length} rounds from ${CATEGORIES_FILE} (migrated)`);
        return { rounds, activeRoundIndex: 0 };
      } else {
        // New format with rounds
        console.log(`[${new Date().toISOString()}] Loaded ${parsed.rounds?.length || 0} rounds from ${CATEGORIES_FILE}`);
        return {
          rounds: parsed.rounds || [],
          activeRoundIndex: parsed.activeRoundIndex || 0
        };
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error loading categories:`, error);
  }
  return { rounds: [], activeRoundIndex: 0 };
}

// Save categories to JSON file (new rounds format)
function saveCategories() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const dataToSave = {
      rounds: timerState.rounds,
      activeRoundIndex: timerState.activeRoundIndex
    };
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(dataToSave, null, 2));
    console.log(`[${new Date().toISOString()}] Saved ${timerState.rounds.length} rounds to ${CATEGORIES_FILE}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error saving categories:`, error);
  }
}

const app = express();
const server = http.createServer(app);

// Socket.IO with CORS configuration for cloud deployment
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for monitoring services
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    connectedClients: connectedClients,
    timestamp: new Date().toISOString()
  });
});

// API endpoint to get current timer state
app.get('/api/state', (req, res) => {
  res.json({
    state: timerState,
    connectedClients: connectedClients
  });
});

// API endpoint to import climbers from Excel
// Excel format: Each sheet = one round. Column headers = category names, rows = climber names
app.post('/api/import-excel', upload.single('excel'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse Excel file from buffer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

    // Process ALL sheets - each sheet becomes a round
    const newRounds = [];
    let globalCategoryId = 1;

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON with headers as first row
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (data.length < 2) {
        // Skip empty sheets
        continue;
      }

      // First row is headers (category names)
      const headers = data[0].filter(h => h && String(h).trim());

      if (headers.length === 0) {
        // Skip sheets without category headers
        continue;
      }

      if (headers.length > 4) {
        return res.status(400).json({ error: `Sheet "${sheetName}": Maximum 4 categories allowed. Found: ${headers.length}` });
      }

      // Build categories from columns for this sheet
      const roundCategories = headers.map((categoryName, colIndex) => {
        // Get climbers from this column (rows 1+)
        const climbers = [];
        for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
          const cellValue = data[rowIndex][colIndex];
          if (cellValue && String(cellValue).trim()) {
            climbers.push(String(cellValue).trim());
          }
        }

        // All boulders start with climber index 0 - climbers progress B1 -> B2 -> B3 -> B4
        return {
          id: globalCategoryId++,
          name: String(categoryName).trim(),
          boulders: [
            { boulderId: 1, climbers: [...climbers], currentClimberIndex: 0, skipNext: false, hasStarted: false },
            { boulderId: 2, climbers: [...climbers], currentClimberIndex: 0, skipNext: false, hasStarted: false },
            { boulderId: 3, climbers: [...climbers], currentClimberIndex: 0, skipNext: false, hasStarted: false },
            { boulderId: 4, climbers: [...climbers], currentClimberIndex: 0, skipNext: false, hasStarted: false }
          ],
          climberProgress: {}
        };
      });

      // Add this round (use "Round X" naming instead of sheet name)
      newRounds.push({
        name: `Round ${newRounds.length + 1}`,
        categories: roundCategories
      });
    }

    if (newRounds.length === 0) {
      return res.status(400).json({ error: 'No valid sheets found. Each sheet must have headers and at least one climber.' });
    }

    // Update state with new rounds
    timerState.rounds = newRounds;
    timerState.activeRoundIndex = 0;
    timerState.categories = newRounds[0].categories;

    // Save and broadcast to all clients
    saveCategories();
    io.emit('rounds-sync', {
      rounds: timerState.rounds.map(r => ({ name: r.name, categoryCount: r.categories.length })),
      activeRoundIndex: timerState.activeRoundIndex
    });
    io.emit('categories-sync', timerState.categories);

    const totalClimbers = newRounds.reduce((sum, round) =>
      sum + round.categories.reduce((catSum, cat) => catSum + (cat.boulders[0]?.climbers?.length || 0), 0)
    , 0);
    const totalCategories = newRounds.reduce((sum, round) => sum + round.categories.length, 0);

    console.log(`[${new Date().toISOString()}] Imported ${newRounds.length} rounds with ${totalCategories} categories and ${totalClimbers} total climbers from Excel`);

    res.json({
      success: true,
      roundsCreated: newRounds.length,
      categoriesCreated: totalCategories,
      totalClimbers: totalClimbers,
      rounds: newRounds.map(r => ({
        name: r.name,
        categories: r.categories.map(c => ({ name: c.name, climberCount: c.boulders[0]?.climbers?.length || 0 }))
      }))
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error importing Excel:`, error);
    res.status(500).json({ error: 'Failed to parse Excel file: ' + error.message });
  }
});

// Store the current timer state on the server
const loadedData = loadCategories();
let timerState = {
  climbMin: 4,
  climbSec: 0,
  transMin: 1,
  transSec: 0,
  phase: 'stopped',
  running: false,
  remaining: 240,
  showNames: true,
  // Multi-round support
  rounds: loadedData.rounds,
  activeRoundIndex: loadedData.activeRoundIndex,
  // categories is derived from the active round
  categories: loadedData.rounds[loadedData.activeRoundIndex]?.categories || []
  // categories structure:
  // [
  //   {
  //     id: 1,
  //     name: "Women 18-24",
  //     boulders: [
  //       { boulderId: 1, climbers: ["Name1", "Name2", ...], currentClimberIndex: 0, held: false },
  //       { boulderId: 2, climbers: ["Name1", "Name2", ...], currentClimberIndex: 0, held: false },
  //       { boulderId: 3, climbers: ["Name1", "Name2", ...], currentClimberIndex: 0, held: false },
  //       { boulderId: 4, climbers: ["Name1", "Name2", ...], currentClimberIndex: 0, held: false }
  //     ],
  //     climberProgress: {
  //       "Name1": [1, 2],        // Has climbed boulders 1 and 2
  //       "Name2": [1, 2, 3, 4],  // Completed all 4 - will be hidden
  //     }
  //   }
  // ]
};

// Track connected clients
let connectedClients = 0;

// Server-side timer interval
let timerInterval = null;

// Helper functions
const totalClimb = () => timerState.climbMin * 60 + timerState.climbSec;
const totalTrans = () => timerState.transMin * 60 + timerState.transSec;

// --- Climber Completion Tracking Helpers ---

// Initialize climberProgress if it doesn't exist
function ensureClimberProgress(category) {
  if (!category.climberProgress) {
    category.climberProgress = {};
  }
}

// Record that a climber has climbed on a specific boulder
function recordClimberProgress(category, climberName, boulderId) {
  ensureClimberProgress(category);
  if (!category.climberProgress[climberName]) {
    category.climberProgress[climberName] = [];
  }
  if (!category.climberProgress[climberName].includes(boulderId)) {
    category.climberProgress[climberName].push(boulderId);
    category.climberProgress[climberName].sort((a, b) => a - b);
  }
}

// Check if a climber has completed all 4 boulders
function isClimberCompleted(category, climberName) {
  ensureClimberProgress(category);
  const progress = category.climberProgress[climberName] || [];
  return progress.length >= 4 && [1, 2, 3, 4].every(b => progress.includes(b));
}

// Get count of active (non-completed) climbers in a category
function getActiveClimberCount(category) {
  const climbers = category.boulders[0]?.climbers || [];
  return climbers.filter(name => !isClimberCompleted(category, name)).length;
}

// Find next non-completed climber index, starting from current position
function getNextActiveClimberIndex(boulder, category, startIndex) {
  const climbers = boulder.climbers || [];
  if (climbers.length === 0) return 0;

  // Try each position starting from startIndex
  for (let i = 0; i < climbers.length; i++) {
    const index = (startIndex + i) % climbers.length;
    const climberName = climbers[index];
    if (!isClimberCompleted(category, climberName)) {
      return index;
    }
  }
  // All climbers completed - return startIndex (will show as all done)
  return startIndex;
}

// Check if a boulder can start (previous boulder must have advanced at least twice)
// This ensures climbers get one full climb phase of rest between boulders
function canBoulderStart(category, boulderIndex) {
  if (boulderIndex === 0) return true; // B1 can always start

  const prevBoulder = category.boulders[boulderIndex - 1];
  // Previous boulder must be started AND have advanced at least twice
  // (climber needs 1 round climbing + 1 round resting before next boulder)
  return prevBoulder && prevBoulder.hasStarted && prevBoulder.currentClimberIndex > 1;
}

// Advance a single boulder, recording progress and skipping completed climbers
// boulderIndex is optional - if provided, checks cascading start rules
// Returns true if this boulder had a skip that should flow to next boulder
function advanceBoulder(boulder, category, boulderIndex = null) {
  if (!boulder.climbers || boulder.climbers.length === 0) return false;

  // Check if this boulder has a pending skip (empty slot flowing through)
  if (boulder.skipNext) {
    boulder.skipNext = false;
    // Pass skip to next boulder if it exists
    if (boulderIndex !== null && boulderIndex < category.boulders.length - 1) {
      category.boulders[boulderIndex + 1].skipNext = true;
    }
    // Don't advance climber index - no one climbed, just showing empty
    return true;
  }

  // If boulder hasn't started yet, check if it can start
  if (!boulder.hasStarted) {
    // If boulderIndex provided, check cascading rules
    if (boulderIndex !== null && !canBoulderStart(category, boulderIndex)) {
      return false; // Can't start yet - previous boulder hasn't advanced
    }

    boulder.hasStarted = true;
    // Record that first climber is now on this boulder
    const firstClimber = boulder.climbers[boulder.currentClimberIndex];
    if (firstClimber) {
      recordClimberProgress(category, firstClimber, boulder.boulderId);
    }
    return false;
  }

  // Record that current climber has climbed this boulder
  const currentClimber = boulder.climbers[boulder.currentClimberIndex];
  if (currentClimber) {
    recordClimberProgress(category, currentClimber, boulder.boulderId);
  }

  // Find next active (non-completed) climber
  const nextIndex = (boulder.currentClimberIndex + 1) % boulder.climbers.length;
  boulder.currentClimberIndex = getNextActiveClimberIndex(boulder, category, nextIndex);
  return false;
}

// Auto-advance all non-held climbers (called when climb phase ends)
// Process boulders in order (B1 first) to correctly handle cascading starts
function advanceNonHeldClimbers() {
  timerState.categories.forEach(category => {
    for (let i = 0; i < category.boulders.length; i++) {
      advanceBoulder(category.boulders[i], category, i);
    }
  });
  console.log(`[${new Date().toISOString()}] Auto-advanced all non-held climbers`);
}

// Server-side countdown function
function startServerTimer() {
  if (timerInterval) return; // Already running

  timerInterval = setInterval(() => {
    if (!timerState.running) {
      stopServerTimer();
      return;
    }

    const prev = timerState.remaining;
    const next = Math.max(prev - 1, 0);
    timerState.remaining = next;

    // Broadcast the updated time to all clients
    io.emit('timer-sync', timerState);
    console.log(`[${new Date().toISOString()}] Timer tick: ${timerState.phase} - ${next}s remaining`);

    // Handle phase auto-advance when time hits 0
    if (next === 0) {
      setTimeout(() => {
        if (timerState.phase === 'climb') {
          // Auto-advance climbers before transitioning away from climb phase
          advanceNonHeldClimbers();
          io.emit('categories-sync', timerState.categories);
          saveCategories();

          if (totalTrans() > 0) {
            timerState.phase = 'transition';
            timerState.remaining = totalTrans();
          } else {
            timerState.phase = 'climb';
            timerState.remaining = totalClimb();
          }
        } else if (timerState.phase === 'transition') {
          timerState.phase = 'climb';
          timerState.remaining = totalClimb();
        }
        console.log(`[${new Date().toISOString()}] Phase advanced to: ${timerState.phase}`);
        io.emit('timer-sync', timerState);
      }, 1000); // Advance after the 0 is displayed for 1 second
    }
  }, 1000);
}

function stopServerTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    console.log(`[${new Date().toISOString()}] Server timer stopped`);
  }
}

io.on('connection', (socket) => {
  connectedClients++;
  const clientId = socket.id.substring(0, 8);
  console.log(`[${new Date().toISOString()}] Client ${clientId} connected. Total: ${connectedClients}`);

  // Send the current timer state to the newly connected client
  socket.emit('timer-sync', timerState);
  socket.emit('config-sync', {
    climbMin: timerState.climbMin,
    climbSec: timerState.climbSec,
    transMin: timerState.transMin,
    transSec: timerState.transSec,
    showNames: timerState.showNames
  });
  // Send rounds info for multi-round navigation
  socket.emit('rounds-sync', {
    rounds: timerState.rounds.map(r => ({ name: r.name, categoryCount: r.categories.length })),
    activeRoundIndex: timerState.activeRoundIndex
  });
  socket.emit('categories-sync', timerState.categories);

  // Broadcast the updated client count to all clients
  io.emit('client-count', connectedClients);

  // Listen for timer state updates from any client
  socket.on('timer-update', (newState) => {
    try {
      // Validate incoming state
      if (typeof newState === 'object' && newState !== null) {
        const wasRunning = timerState.running;

        // Update the server's state
        timerState = { ...timerState, ...newState };

        // Start or stop the server timer based on running state
        if (timerState.running && !wasRunning) {
          startServerTimer();
          console.log(`[${new Date().toISOString()}] Timer started by ${clientId}`);
        } else if (!timerState.running && wasRunning) {
          stopServerTimer();
          console.log(`[${new Date().toISOString()}] Timer stopped by ${clientId}`);
        }

        // Broadcast the new state to ALL clients
        io.emit('timer-sync', timerState);

        console.log(`[${new Date().toISOString()}] Timer updated by ${clientId}: phase=${timerState.phase}, remaining=${timerState.remaining}, running=${timerState.running}`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error updating timer:`, error);
    }
  });

  // Listen for configuration changes
  socket.on('config-update', (config) => {
    try {
      if (typeof config === 'object' && config !== null) {
        timerState.climbMin = config.climbMin;
        timerState.climbSec = config.climbSec;
        timerState.transMin = config.transMin;
        timerState.transSec = config.transSec;
        if (typeof config.showNames === 'boolean') {
          timerState.showNames = config.showNames;
        }

        // Broadcast config changes to ALL clients (including display screens)
        io.emit('config-sync', {
          climbMin: timerState.climbMin,
          climbSec: timerState.climbSec,
          transMin: timerState.transMin,
          transSec: timerState.transSec,
          showNames: timerState.showNames
        });

        console.log(`[${new Date().toISOString()}] Config updated by ${clientId}: climb=${config.climbMin}:${config.climbSec}, showNames=${timerState.showNames}`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error updating config:`, error);
    }
  });

  // Listen for category add/update
  socket.on('category-update', (category) => {
    try {
      if (typeof category === 'object' && category !== null) {
        const existingIndex = timerState.categories.findIndex(c => c.id === category.id);

        if (existingIndex >= 0) {
          // Update existing category
          timerState.categories[existingIndex] = category;
          console.log(`[${new Date().toISOString()}] Category updated by ${clientId}: ${category.name}`);
        } else {
          // Add new category
          timerState.categories.push(category);
          console.log(`[${new Date().toISOString()}] Category added by ${clientId}: ${category.name}`);
        }

        // Ensure active round exists, create if needed
        if (timerState.rounds.length === 0) {
          timerState.rounds.push({ name: 'Round 1', categories: [] });
          timerState.activeRoundIndex = 0;
        }
        // Sync categories back to the active round
        timerState.rounds[timerState.activeRoundIndex].categories = timerState.categories;

        // Broadcast to all clients
        io.emit('categories-sync', timerState.categories);
        saveCategories();
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error updating category:`, error);
    }
  });

  // Listen for category delete
  socket.on('category-delete', (categoryId) => {
    try {
      const initialLength = timerState.categories.length;
      timerState.categories = timerState.categories.filter(c => c.id !== categoryId);

      if (timerState.categories.length < initialLength) {
        // Sync categories back to the active round
        if (timerState.rounds.length > 0) {
          timerState.rounds[timerState.activeRoundIndex].categories = timerState.categories;
        }
        console.log(`[${new Date().toISOString()}] Category deleted by ${clientId}: ID ${categoryId}`);
        io.emit('categories-sync', timerState.categories);
        saveCategories();
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error deleting category:`, error);
    }
  });

  // Listen for climber advancement (specific category and boulder)
  socket.on('advance-climber', (data) => {
    try {
      const { categoryId, boulderId } = data;
      const category = timerState.categories.find(c => c.id === categoryId);

      if (category) {
        const boulderIndex = category.boulders.findIndex(b => b.boulderId === boulderId);
        const boulder = category.boulders[boulderIndex];
        if (boulder && boulder.climbers.length > 0) {
          advanceBoulder(boulder, category, boulderIndex);
          console.log(`[${new Date().toISOString()}] Climber advanced by ${clientId}: ${category.name} - Boulder ${boulderId}`);
          io.emit('categories-sync', timerState.categories);
          saveCategories();
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error advancing climber:`, error);
    }
  });

  // Listen for advance all climbers in a specific boulder
  socket.on('advance-boulder', (boulderId) => {
    try {
      timerState.categories.forEach(category => {
        const boulderIndex = category.boulders.findIndex(b => b.boulderId === boulderId);
        const boulder = category.boulders[boulderIndex];
        if (boulder) {
          advanceBoulder(boulder, category, boulderIndex);
        }
      });
      console.log(`[${new Date().toISOString()}] All climbers advanced on Boulder ${boulderId} by ${clientId}`);
      io.emit('categories-sync', timerState.categories);
      saveCategories();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error advancing boulder:`, error);
    }
  });

  // Listen for advance all climbers in a specific category
  socket.on('advance-category', (categoryId) => {
    try {
      const category = timerState.categories.find(c => c.id === categoryId);
      if (category) {
        // Process boulders in order to correctly handle cascading starts
        for (let i = 0; i < category.boulders.length; i++) {
          advanceBoulder(category.boulders[i], category, i);
        }
        console.log(`[${new Date().toISOString()}] All climbers advanced in category ${category.name} by ${clientId}`);
        io.emit('categories-sync', timerState.categories);
        saveCategories();
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error advancing category:`, error);
    }
  });

  // Listen for advance all climbers (all categories, all boulders)
  socket.on('advance-all-climbers', () => {
    try {
      timerState.categories.forEach(category => {
        // Process boulders in order to correctly handle cascading starts
        for (let i = 0; i < category.boulders.length; i++) {
          advanceBoulder(category.boulders[i], category, i);
        }
      });
      console.log(`[${new Date().toISOString()}] All climbers advanced by ${clientId}`);
      io.emit('categories-sync', timerState.categories);
      saveCategories();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error advancing all climbers:`, error);
    }
  });

  // Listen for skip climber on boulder (inserts empty that flows through remaining boulders)
  socket.on('skip-boulder-climber', (data) => {
    try {
      const { categoryId, boulderId } = data;
      const category = timerState.categories.find(c => c.id === categoryId);
      if (category) {
        const boulderIndex = category.boulders.findIndex(b => b.boulderId === boulderId);
        const boulder = category.boulders[boulderIndex];
        if (boulder && boulder.hasStarted) {
          // Don't advance this boulder - climber stays in position
          // Just set next boulder to show empty (the skip flows through)
          if (boulderIndex < category.boulders.length - 1) {
            category.boulders[boulderIndex + 1].skipNext = true;
          }

          console.log(`[${new Date().toISOString()}] Skipped climber on Boulder ${boulderId} in ${category.name} by ${clientId}`);
          io.emit('categories-sync', timerState.categories);
          saveCategories();
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error skipping boulder climber:`, error);
    }
  });

  // Listen for reset category progress (clears completion tracking)
  socket.on('reset-category-progress', (categoryId) => {
    try {
      const category = timerState.categories.find(c => c.id === categoryId);
      if (category) {
        // Reset climber progress tracking
        category.climberProgress = {};
        // Reset all boulder indices to 0, hasStarted to false, clear skips
        category.boulders.forEach((boulder) => {
          boulder.currentClimberIndex = 0;
          boulder.hasStarted = false;
          boulder.skipNext = false;
        });
        console.log(`[${new Date().toISOString()}] Category progress reset by ${clientId}: ${category.name}`);
        io.emit('categories-sync', timerState.categories);
        saveCategories();
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error resetting category progress:`, error);
    }
  });

  // Listen for round switch (multi-round navigation)
  socket.on('switch-round', (roundIndex) => {
    try {
      const newIndex = parseInt(roundIndex);
      if (isNaN(newIndex) || newIndex < 0 || newIndex >= timerState.rounds.length) {
        console.log(`[${new Date().toISOString()}] Invalid round index: ${roundIndex}`);
        return;
      }

      // Update active round index
      timerState.activeRoundIndex = newIndex;

      // Reset all category progress in the new round (fresh start)
      const newRound = timerState.rounds[newIndex];
      newRound.categories.forEach(category => {
        category.climberProgress = {};
        category.boulders.forEach(boulder => {
          boulder.currentClimberIndex = 0;
          boulder.hasStarted = false;
          boulder.skipNext = false;
        });
      });

      // Update categories from active round
      timerState.categories = newRound.categories;

      console.log(`[${new Date().toISOString()}] Switched to round ${newIndex + 1} (${newRound.name}) by ${clientId}`);

      // Broadcast to all clients
      io.emit('rounds-sync', {
        rounds: timerState.rounds.map(r => ({ name: r.name, categoryCount: r.categories.length })),
        activeRoundIndex: timerState.activeRoundIndex
      });
      io.emit('categories-sync', timerState.categories);
      saveCategories();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error switching round:`, error);
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Socket error for ${clientId}:`, error);
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    connectedClients--;
    console.log(`[${new Date().toISOString()}] Client ${clientId} disconnected. Total: ${connectedClients}`);

    // Broadcast the updated client count to all remaining clients
    io.emit('client-count', connectedClients);
  });
});

// Set the port (use environment variable for production)
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n===========================================`);
  console.log(`  Climbing Timer Server`);
  console.log(`===========================================`);
  console.log(`  Environment:  ${NODE_ENV}`);
  console.log(`  Port:         ${PORT}`);
  console.log(`  Time:         ${new Date().toISOString()}`);
  console.log(`===========================================`);

  if (NODE_ENV === 'development') {
    console.log(`\n  Local:            http://localhost:${PORT}`);
    console.log(`  Health Check:     http://localhost:${PORT}/health`);
    console.log(`  API State:        http://localhost:${PORT}/api/state\n`);
  } else {
    console.log(`\n  Health endpoint:  /health`);
    console.log(`  API endpoint:     /api/state\n`);
  }

  console.log(`Server is ready to accept connections.\n`);
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n[${new Date().toISOString()}] ${signal} received. Starting graceful shutdown...`);

  // Save categories before shutdown
  saveCategories();

  server.close(() => {
    console.log(`[${new Date().toISOString()}] HTTP server closed`);

    io.close(() => {
      console.log(`[${new Date().toISOString()}] Socket.IO server closed`);
      console.log(`[${new Date().toISOString()}] Graceful shutdown complete`);
      process.exit(0);
    });
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error(`[${new Date().toISOString()}] Forced shutdown after timeout`);
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${new Date().toISOString()}] Unhandled Rejection at:`, promise, 'reason:', reason);
});
