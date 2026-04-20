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

// --- Multi-Room Support ---
const DEFAULT_ROOM = 'default';
const rooms = new Map();

// Sanitize room ID to prevent path traversal and invalid characters
function sanitizeRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') return DEFAULT_ROOM;
  // Only allow alphanumeric, hyphens, and underscores
  const sanitized = roomId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
  return sanitized || DEFAULT_ROOM;
}

// Create default timer state for a new room
function createRoomState() {
  return {
    timerState: {
      climbMin: 4,
      climbSec: 0,
      transMin: 1,
      transSec: 0,
      phase: 'stopped',
      running: false,
      remaining: 240,
      showNames: true,
      rounds: [],
      activeRoundIndex: 0,
      categories: []
    },
    timerInterval: null,
    connectedClients: 0,
    lastActivity: Date.now()
  };
}

// Get persistence file path for a room
function getRoomDataFile(roomId) {
  return path.join(DATA_DIR, `room_${roomId}.json`);
}

// Load room data from persistence
function loadRoomData(roomId) {
  try {
    const filePath = getRoomDataFile(roomId);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      console.log(`[${new Date().toISOString()}] Loaded room data for "${roomId}"`);
      return parsed;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error loading room data for "${roomId}":`, error);
  }
  return null;
}

// Save room data to persistence
function saveRoomData(roomId, room) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const dataToSave = {
      rounds: room.timerState.rounds,
      activeRoundIndex: room.timerState.activeRoundIndex
    };
    fs.writeFileSync(getRoomDataFile(roomId), JSON.stringify(dataToSave, null, 2));
    console.log(`[${new Date().toISOString()}] Saved room data for "${roomId}"`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error saving room data for "${roomId}":`, error);
  }
}

// Get or create a room
function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    const room = createRoomState();

    // Try to load persisted data
    const persistedData = loadRoomData(roomId);
    if (persistedData) {
      // Restore rounds from persistence
      if (Array.isArray(persistedData.rounds)) {
        room.timerState.rounds = persistedData.rounds.map(r => ({
          ...r,
          categories: r.categories || []
        }));
      }
      room.timerState.activeRoundIndex = persistedData.activeRoundIndex || 0;
      room.timerState.categories = room.timerState.rounds[room.timerState.activeRoundIndex]?.categories || [];
    }

    rooms.set(roomId, room);
    console.log(`[${new Date().toISOString()}] Created room "${roomId}"`);
  }
  return rooms.get(roomId);
}

// Get list of all active rooms
function getAllRooms() {
  const roomList = [];
  for (const [roomId, room] of rooms) {
    roomList.push({
      id: roomId,
      connectedClients: room.connectedClients,
      phase: room.timerState.phase,
      running: room.timerState.running,
      categoriesCount: room.timerState.categories.length,
      roundsCount: room.timerState.rounds.length
    });
  }
  return roomList;
}

// Delete a room
function deleteRoom(roomId) {
  // Don't delete the last room - must have at least one
  if (rooms.size <= 1) return false;

  const room = rooms.get(roomId);
  if (room) {
    // Stop any running timer
    if (room.timerInterval) {
      clearInterval(room.timerInterval);
    }
    rooms.delete(roomId);

    // Delete persistence file
    try {
      const filePath = getRoomDataFile(roomId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error deleting room file for "${roomId}":`, error);
    }

    console.log(`[${new Date().toISOString()}] Deleted room "${roomId}"`);
    return true;
  }
  return false;
}

// Migrate old categories.json to room_default.json on first run
function migrateOldCategories() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const defaultRoomFile = getRoomDataFile(DEFAULT_ROOM);

    // If default room file already exists, skip migration
    if (fs.existsSync(defaultRoomFile)) {
      return;
    }

    // Check if old categories.json exists
    if (fs.existsSync(CATEGORIES_FILE)) {
      const data = fs.readFileSync(CATEGORIES_FILE, 'utf8');
      const parsed = JSON.parse(data);

      let migrationData = { rounds: [], activeRoundIndex: 0 };

      // Check if it's old format (array of categories) or newer format (object with rounds)
      if (Array.isArray(parsed)) {
        migrationData.rounds = parsed.length > 0 ? [{ name: 'Round 1', categories: parsed }] : [];
      } else {
        migrationData.rounds = (parsed.rounds || []).map(r => ({
          ...r,
          categories: r.categories || []
        }));
        migrationData.activeRoundIndex = parsed.activeRoundIndex || 0;
      }

      // Save to new room file
      fs.writeFileSync(defaultRoomFile, JSON.stringify(migrationData, null, 2));
      console.log(`[${new Date().toISOString()}] Migrated categories.json to room_default.json`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error during migration:`, error);
  }
}

// Run migration on startup
migrateOldCategories();

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
  let totalClients = 0;
  for (const room of rooms.values()) {
    totalClients += room.connectedClients;
  }
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    connectedClients: totalClients,
    roomCount: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// API endpoint to get current timer state for a room
app.get('/api/state', (req, res) => {
  const roomId = sanitizeRoomId(req.query.room || DEFAULT_ROOM);
  const room = getOrCreateRoom(roomId);
  res.json({
    state: room.timerState,
    connectedClients: room.connectedClients,
    roomId: roomId
  });
});

// API endpoint to list all rooms
app.get('/api/rooms', (req, res) => {
  res.json({
    rooms: getAllRooms()
  });
});

// API endpoint to create a new room
app.post('/api/rooms', express.json(), (req, res) => {
  const { roomId } = req.body;
  const sanitizedId = sanitizeRoomId(roomId);

  if (!sanitizedId) {
    return res.status(400).json({ error: 'Invalid room ID' });
  }

  if (rooms.has(sanitizedId)) {
    return res.status(409).json({ error: 'Room already exists' });
  }

  getOrCreateRoom(sanitizedId);

  res.json({
    success: true,
    roomId: sanitizedId
  });
});

// API endpoint to delete a room
app.delete('/api/rooms/:roomId', (req, res) => {
  const roomId = sanitizeRoomId(req.params.roomId);

  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // Disconnect all clients in the room
  io.to(roomId).emit('room-deleted');

  if (deleteRoom(roomId)) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Cannot delete this room' });
  }
});

// API endpoint to import climbers from Excel
// Excel format: Each sheet = one round. Column headers = category names, rows = climber names
app.post('/api/import-excel', upload.single('excel'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get room from query parameter
    const roomId = sanitizeRoomId(req.query.room || DEFAULT_ROOM);
    const room = getOrCreateRoom(roomId);

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

    // Update room state with new rounds
    room.timerState.rounds = newRounds;
    room.timerState.activeRoundIndex = 0;
    room.timerState.categories = newRounds[0].categories;
    room.lastActivity = Date.now();

    // Save and broadcast to all clients in this room
    saveRoomData(roomId, room);
    io.to(roomId).emit('rounds-sync', {
      rounds: room.timerState.rounds.map(r => ({ name: r.name, categoryCount: r.categories?.length || 0 })),
      activeRoundIndex: room.timerState.activeRoundIndex
    });
    io.to(roomId).emit('categories-sync', room.timerState.categories);

    const totalClimbers = newRounds.reduce((sum, round) =>
      sum + round.categories.reduce((catSum, cat) => catSum + (cat.boulders[0]?.climbers?.length || 0), 0)
    , 0);
    const totalCategories = newRounds.reduce((sum, round) => sum + round.categories.length, 0);

    console.log(`[${new Date().toISOString()}] [Room: ${roomId}] Imported ${newRounds.length} rounds with ${totalCategories} categories and ${totalClimbers} total climbers from Excel`);

    res.json({
      success: true,
      roomId: roomId,
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

// Initialize default room on startup
getOrCreateRoom(DEFAULT_ROOM);

// Helper functions for room timer calculations
const totalClimb = (timerState) => timerState.climbMin * 60 + timerState.climbSec;
const totalTrans = (timerState) => timerState.transMin * 60 + timerState.transSec;

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
function advanceNonHeldClimbers(timerState) {
  timerState.categories.forEach(category => {
    for (let i = 0; i < category.boulders.length; i++) {
      advanceBoulder(category.boulders[i], category, i);
    }
  });
}

// Server-side countdown function for a specific room
function startServerTimerForRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.timerInterval) return; // Room doesn't exist or already running

  room.timerInterval = setInterval(() => {
    const timerState = room.timerState;
    if (!timerState.running) {
      stopServerTimerForRoom(roomId);
      return;
    }

    const prev = timerState.remaining;
    const next = Math.max(prev - 1, 0);
    timerState.remaining = next;
    room.lastActivity = Date.now();

    // Broadcast the updated time to all clients in this room
    io.to(roomId).emit('timer-sync', timerState);
    console.log(`[${new Date().toISOString()}] [Room: ${roomId}] Timer tick: ${timerState.phase} - ${next}s remaining`);

    // Handle phase auto-advance when time hits 0
    if (next === 0) {
      setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom) return;

        const ts = currentRoom.timerState;
        if (ts.phase === 'climb') {
          // Auto-advance climbers before transitioning away from climb phase
          advanceNonHeldClimbers(ts);
          io.to(roomId).emit('categories-sync', ts.categories);
          saveRoomData(roomId, currentRoom);

          if (totalTrans(ts) > 0) {
            ts.phase = 'transition';
            ts.remaining = totalTrans(ts);
          } else {
            ts.phase = 'climb';
            ts.remaining = totalClimb(ts);
          }
        } else if (ts.phase === 'transition') {
          ts.phase = 'climb';
          ts.remaining = totalClimb(ts);
        }
        console.log(`[${new Date().toISOString()}] [Room: ${roomId}] Phase advanced to: ${ts.phase}`);
        io.to(roomId).emit('timer-sync', ts);
      }, 1000); // Advance after the 0 is displayed for 1 second
    }
  }, 1000);
}

function stopServerTimerForRoom(roomId) {
  const room = rooms.get(roomId);
  if (room && room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
    console.log(`[${new Date().toISOString()}] [Room: ${roomId}] Server timer stopped`);
  }
}

io.on('connection', (socket) => {
  const clientId = socket.id.substring(0, 8);
  const roomId = sanitizeRoomId(socket.handshake.query.room || DEFAULT_ROOM);
  const clientType = socket.handshake.query.type || 'display'; // 'operator' or 'display'

  // Join the Socket.IO room
  socket.join(roomId);
  socket.roomId = roomId;
  socket.clientType = clientType;

  // Get or create the room
  const room = getOrCreateRoom(roomId);
  room.connectedClients++;
  room.lastActivity = Date.now();

  const timerState = room.timerState;

  console.log(`[${new Date().toISOString()}] [Room: ${roomId}] Client ${clientId} (${clientType}) connected. Room clients: ${room.connectedClients}`);

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
    rounds: timerState.rounds.map(r => ({ name: r.name, categoryCount: r.categories?.length || 0 })),
    activeRoundIndex: timerState.activeRoundIndex
  });
  socket.emit('categories-sync', timerState.categories);

  // Send room info
  socket.emit('room-info', { roomId: roomId });

  // Broadcast the updated client count to all clients in the room
  io.to(roomId).emit('client-count', room.connectedClients);

  // Listen for timer state updates from any client
  socket.on('timer-update', (newState) => {

    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;

      // Validate incoming state
      if (typeof newState === 'object' && newState !== null) {
        const wasRunning = ts.running;

        // Update the server's state
        Object.assign(ts, newState);
        currentRoom.lastActivity = Date.now();

        // Start or stop the server timer based on running state
        if (ts.running && !wasRunning) {
          startServerTimerForRoom(socket.roomId);
          console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Timer started by ${clientId}`);
        } else if (!ts.running && wasRunning) {
          stopServerTimerForRoom(socket.roomId);
          console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Timer stopped by ${clientId}`);
        }

        // Broadcast the new state to ALL clients in the room
        io.to(socket.roomId).emit('timer-sync', ts);

        console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Timer updated by ${clientId}: phase=${ts.phase}, remaining=${ts.remaining}, running=${ts.running}`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error updating timer:`, error);
    }
  });

  // Listen for configuration changes
  socket.on('config-update', (config) => {
    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;

      if (typeof config === 'object' && config !== null) {
        ts.climbMin = config.climbMin;
        ts.climbSec = config.climbSec;
        ts.transMin = config.transMin;
        ts.transSec = config.transSec;
        if (typeof config.showNames === 'boolean') {
          ts.showNames = config.showNames;
        }
        currentRoom.lastActivity = Date.now();

        // Broadcast config changes to ALL clients in the room
        io.to(socket.roomId).emit('config-sync', {
          climbMin: ts.climbMin,
          climbSec: ts.climbSec,
          transMin: ts.transMin,
          transSec: ts.transSec,
          showNames: ts.showNames
        });

        console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Config updated by ${clientId}: climb=${config.climbMin}:${config.climbSec}, showNames=${ts.showNames}`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error updating config:`, error);
    }
  });

  // Listen for category add/update
  socket.on('category-update', (category) => {
    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;

      if (typeof category === 'object' && category !== null) {
        const existingIndex = ts.categories.findIndex(c => c.id === category.id);

        if (existingIndex >= 0) {
          // Update existing category
          ts.categories[existingIndex] = category;
          console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Category updated by ${clientId}: ${category.name}`);
        } else {
          // Add new category
          ts.categories.push(category);
          console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Category added by ${clientId}: ${category.name}`);
        }

        // Ensure active round exists, create if needed
        if (ts.rounds.length === 0) {
          ts.rounds.push({ name: 'Round 1', categories: [] });
          ts.activeRoundIndex = 0;
        }
        // Sync categories back to the active round
        ts.rounds[ts.activeRoundIndex].categories = ts.categories;
        currentRoom.lastActivity = Date.now();

        // Broadcast to all clients in the room
        io.to(socket.roomId).emit('categories-sync', ts.categories);
        saveRoomData(socket.roomId, currentRoom);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error updating category:`, error);
    }
  });

  // Listen for category delete
  socket.on('category-delete', (categoryId) => {
    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;
      const initialLength = ts.categories.length;
      ts.categories = ts.categories.filter(c => c.id !== categoryId);

      if (ts.categories.length < initialLength) {
        // Sync categories back to the active round
        if (ts.rounds.length > 0) {
          ts.rounds[ts.activeRoundIndex].categories = ts.categories;
        }
        currentRoom.lastActivity = Date.now();
        console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Category deleted by ${clientId}: ID ${categoryId}`);
        io.to(socket.roomId).emit('categories-sync', ts.categories);
        saveRoomData(socket.roomId, currentRoom);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error deleting category:`, error);
    }
  });

  // Listen for climber advancement (specific category and boulder)
  socket.on('advance-climber', (data) => {
    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;
      const { categoryId, boulderId } = data;
      const category = ts.categories.find(c => c.id === categoryId);

      if (category) {
        const boulderIndex = category.boulders.findIndex(b => b.boulderId === boulderId);
        const boulder = category.boulders[boulderIndex];
        if (boulder && boulder.climbers.length > 0) {
          advanceBoulder(boulder, category, boulderIndex);
          currentRoom.lastActivity = Date.now();
          console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Climber advanced by ${clientId}: ${category.name} - Boulder ${boulderId}`);
          io.to(socket.roomId).emit('categories-sync', ts.categories);
          saveRoomData(socket.roomId, currentRoom);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error advancing climber:`, error);
    }
  });

  // Listen for advance all climbers in a specific boulder
  socket.on('advance-boulder', (boulderId) => {
    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;
      ts.categories.forEach(category => {
        const boulderIndex = category.boulders.findIndex(b => b.boulderId === boulderId);
        const boulder = category.boulders[boulderIndex];
        if (boulder) {
          advanceBoulder(boulder, category, boulderIndex);
        }
      });
      currentRoom.lastActivity = Date.now();
      console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] All climbers advanced on Boulder ${boulderId} by ${clientId}`);
      io.to(socket.roomId).emit('categories-sync', ts.categories);
      saveRoomData(socket.roomId, currentRoom);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error advancing boulder:`, error);
    }
  });

  // Listen for advance all climbers in a specific category
  socket.on('advance-category', (categoryId) => {
    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;
      const category = ts.categories.find(c => c.id === categoryId);
      if (category) {
        // Process boulders in order to correctly handle cascading starts
        for (let i = 0; i < category.boulders.length; i++) {
          advanceBoulder(category.boulders[i], category, i);
        }
        currentRoom.lastActivity = Date.now();
        console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] All climbers advanced in category ${category.name} by ${clientId}`);
        io.to(socket.roomId).emit('categories-sync', ts.categories);
        saveRoomData(socket.roomId, currentRoom);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error advancing category:`, error);
    }
  });

  // Listen for advance all climbers (all categories, all boulders)
  socket.on('advance-all-climbers', () => {
    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;
      ts.categories.forEach(category => {
        // Process boulders in order to correctly handle cascading starts
        for (let i = 0; i < category.boulders.length; i++) {
          advanceBoulder(category.boulders[i], category, i);
        }
      });
      currentRoom.lastActivity = Date.now();
      console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] All climbers advanced by ${clientId}`);
      io.to(socket.roomId).emit('categories-sync', ts.categories);
      saveRoomData(socket.roomId, currentRoom);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error advancing all climbers:`, error);
    }
  });

  // Listen for skip climber on boulder (inserts empty that flows through remaining boulders)
  socket.on('skip-boulder-climber', (data) => {
    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;
      const { categoryId, boulderId } = data;
      const category = ts.categories.find(c => c.id === categoryId);
      if (category) {
        const boulderIndex = category.boulders.findIndex(b => b.boulderId === boulderId);
        const boulder = category.boulders[boulderIndex];
        if (boulder && boulder.hasStarted) {
          // Don't advance this boulder - climber stays in position
          // Just set next boulder to show empty (the skip flows through)
          if (boulderIndex < category.boulders.length - 1) {
            category.boulders[boulderIndex + 1].skipNext = true;
          }
          currentRoom.lastActivity = Date.now();

          console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Skipped climber on Boulder ${boulderId} in ${category.name} by ${clientId}`);
          io.to(socket.roomId).emit('categories-sync', ts.categories);
          saveRoomData(socket.roomId, currentRoom);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error skipping boulder climber:`, error);
    }
  });

  // Listen for reset category progress (clears completion tracking)
  socket.on('reset-category-progress', (categoryId) => {
    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;
      const category = ts.categories.find(c => c.id === categoryId);
      if (category) {
        // Reset climber progress tracking
        category.climberProgress = {};
        // Reset all boulder indices to 0, hasStarted to false, clear skips
        category.boulders.forEach((boulder) => {
          boulder.currentClimberIndex = 0;
          boulder.hasStarted = false;
          boulder.skipNext = false;
        });
        currentRoom.lastActivity = Date.now();
        console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Category progress reset by ${clientId}: ${category.name}`);
        io.to(socket.roomId).emit('categories-sync', ts.categories);
        saveRoomData(socket.roomId, currentRoom);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error resetting category progress:`, error);
    }
  });

  // Listen for round switch (multi-round navigation)
  socket.on('switch-round', (roundIndex) => {
    try {
      const currentRoom = rooms.get(socket.roomId);
      if (!currentRoom) return;

      const ts = currentRoom.timerState;
      const newIndex = parseInt(roundIndex);
      if (isNaN(newIndex) || newIndex < 0 || newIndex >= ts.rounds.length) {
        console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Invalid round index: ${roundIndex}`);
        return;
      }

      // Update active round index
      ts.activeRoundIndex = newIndex;

      // Reset all category progress in the new round (fresh start)
      const newRound = ts.rounds[newIndex];
      newRound.categories.forEach(category => {
        category.climberProgress = {};
        category.boulders.forEach(boulder => {
          boulder.currentClimberIndex = 0;
          boulder.hasStarted = false;
          boulder.skipNext = false;
        });
      });

      // Update categories from active round
      ts.categories = newRound.categories;
      currentRoom.lastActivity = Date.now();

      console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Switched to round ${newIndex + 1} (${newRound.name}) by ${clientId}`);

      // Broadcast to all clients in the room
      io.to(socket.roomId).emit('rounds-sync', {
        rounds: ts.rounds.map(r => ({ name: r.name, categoryCount: r.categories?.length || 0 })),
        activeRoundIndex: ts.activeRoundIndex
      });
      io.to(socket.roomId).emit('categories-sync', ts.categories);
      saveRoomData(socket.roomId, currentRoom);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Error switching round:`, error);
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Socket error for ${clientId}:`, error);
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    const currentRoom = rooms.get(socket.roomId);
    if (currentRoom) {
      currentRoom.connectedClients--;
      console.log(`[${new Date().toISOString()}] [Room: ${socket.roomId}] Client ${clientId} disconnected. Room clients: ${currentRoom.connectedClients}`);

      // Broadcast the updated client count to all remaining clients in the room
      io.to(socket.roomId).emit('client-count', currentRoom.connectedClients);
    }
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

// --- Room Cleanup ---
// Configurable cleanup threshold (default 24 hours in ms)
const ROOM_CLEANUP_THRESHOLD_MS = parseInt(process.env.ROOM_CLEANUP_HOURS || '24') * 60 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

function cleanupInactiveRooms() {
  const now = Date.now();
  const roomsToDelete = [];

  for (const [roomId, room] of rooms) {
    // Never delete default room
    if (roomId === DEFAULT_ROOM) continue;

    // Don't delete rooms with running timers
    if (room.timerState.running) continue;

    // Don't delete rooms with connected clients
    if (room.connectedClients > 0) continue;

    // Check inactivity threshold
    if (now - room.lastActivity > ROOM_CLEANUP_THRESHOLD_MS) {
      roomsToDelete.push(roomId);
    }
  }

  for (const roomId of roomsToDelete) {
    console.log(`[${new Date().toISOString()}] Cleaning up inactive room: ${roomId}`);
    deleteRoom(roomId);
  }

  if (roomsToDelete.length > 0) {
    console.log(`[${new Date().toISOString()}] Cleaned up ${roomsToDelete.length} inactive rooms`);
  }
}

// Start cleanup interval
const cleanupInterval = setInterval(cleanupInactiveRooms, ROOM_CLEANUP_INTERVAL_MS);

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n[${new Date().toISOString()}] ${signal} received. Starting graceful shutdown...`);

  // Stop cleanup interval
  clearInterval(cleanupInterval);

  // Save all rooms before shutdown
  for (const [roomId, room] of rooms) {
    saveRoomData(roomId, room);
  }
  console.log(`[${new Date().toISOString()}] Saved ${rooms.size} rooms`);

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
