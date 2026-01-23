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
function loadCategories() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(CATEGORIES_FILE)) {
      const data = fs.readFileSync(CATEGORIES_FILE, 'utf8');
      const categories = JSON.parse(data);
      console.log(`[${new Date().toISOString()}] Loaded ${categories.length} categories from ${CATEGORIES_FILE}`);
      return categories;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error loading categories:`, error);
  }
  return [];
}

// Save categories to JSON file
function saveCategories() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(timerState.categories, null, 2));
    console.log(`[${new Date().toISOString()}] Saved ${timerState.categories.length} categories to ${CATEGORIES_FILE}`);
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
// Excel format: Column headers = category names, rows = climber names
app.post('/api/import-excel', upload.single('excel'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse Excel file from buffer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON with headers as first row
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length < 2) {
      return res.status(400).json({ error: 'Excel file must have headers and at least one climber' });
    }

    // First row is headers (category names)
    const headers = data[0].filter(h => h && String(h).trim());

    if (headers.length === 0) {
      return res.status(400).json({ error: 'No category names found in header row' });
    }

    if (headers.length > 4) {
      return res.status(400).json({ error: 'Maximum 4 categories allowed. Found: ' + headers.length });
    }

    // Build categories from columns
    const newCategories = headers.map((categoryName, colIndex) => {
      // Get climbers from this column (rows 1+)
      const climbers = [];
      for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
        const cellValue = data[rowIndex][colIndex];
        if (cellValue && String(cellValue).trim()) {
          climbers.push(String(cellValue).trim());
        }
      }

      // Generate new ID
      const maxId = timerState.categories.length > 0
        ? Math.max(...timerState.categories.map(c => c.id))
        : 0;

      return {
        id: maxId + colIndex + 1,
        name: String(categoryName).trim(),
        boulders: [
          { boulderId: 1, climbers: [...climbers], currentClimberIndex: 0, held: false, hasStarted: false },
          { boulderId: 2, climbers: [...climbers], currentClimberIndex: 0, held: false, hasStarted: false },
          { boulderId: 3, climbers: [...climbers], currentClimberIndex: 0, held: false, hasStarted: false },
          { boulderId: 4, climbers: [...climbers], currentClimberIndex: 0, held: false, hasStarted: false }
        ],
        climberProgress: {}
      };
    });

    // Replace existing categories with imported ones
    timerState.categories = newCategories;

    // Save and broadcast to all clients
    saveCategories();
    io.emit('categories-sync', timerState.categories);

    const totalClimbers = newCategories.reduce((sum, cat) => sum + (cat.boulders[0]?.climbers?.length || 0), 0);
    console.log(`[${new Date().toISOString()}] Imported ${newCategories.length} categories with ${totalClimbers} total climbers from Excel`);

    res.json({
      success: true,
      categoriesCreated: newCategories.length,
      totalClimbers: totalClimbers,
      categories: newCategories.map(c => ({ name: c.name, climberCount: c.boulders[0]?.climbers?.length || 0 }))
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error importing Excel:`, error);
    res.status(500).json({ error: 'Failed to parse Excel file: ' + error.message });
  }
});

// Store the current timer state on the server
let timerState = {
  climbMin: 4,
  climbSec: 0,
  transMin: 1,
  transSec: 0,
  phase: 'stopped',
  running: false,
  remaining: 240,
  categories: loadCategories()
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

// Advance a single boulder, recording progress and skipping completed climbers
function advanceBoulder(boulder, category) {
  if (boulder.held || !boulder.climbers || boulder.climbers.length === 0) return;

  // If boulder hasn't started yet, just mark it as started (first climber becomes active)
  if (!boulder.hasStarted) {
    boulder.hasStarted = true;
    // Record that first climber is now on this boulder
    const firstClimber = boulder.climbers[boulder.currentClimberIndex];
    if (firstClimber) {
      recordClimberProgress(category, firstClimber, boulder.boulderId);
    }
    return;
  }

  // Record that current climber has climbed this boulder
  const currentClimber = boulder.climbers[boulder.currentClimberIndex];
  if (currentClimber) {
    recordClimberProgress(category, currentClimber, boulder.boulderId);
  }

  // Find next active (non-completed) climber
  const nextIndex = (boulder.currentClimberIndex + 1) % boulder.climbers.length;
  boulder.currentClimberIndex = getNextActiveClimberIndex(boulder, category, nextIndex);
}

// Auto-advance all non-held climbers (called when climb phase ends)
function advanceNonHeldClimbers() {
  timerState.categories.forEach(category => {
    category.boulders.forEach(boulder => {
      advanceBoulder(boulder, category);
    });
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

        // Broadcast config changes to all other clients
        socket.broadcast.emit('config-sync', config);

        console.log(`[${new Date().toISOString()}] Config updated by ${clientId}: climb=${config.climbMin}:${config.climbSec}`);
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
        const boulder = category.boulders.find(b => b.boulderId === boulderId);
        if (boulder && boulder.climbers.length > 0) {
          advanceBoulder(boulder, category);
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
        const boulder = category.boulders.find(b => b.boulderId === boulderId);
        if (boulder) {
          advanceBoulder(boulder, category);
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
        category.boulders.forEach(boulder => {
          advanceBoulder(boulder, category);
        });
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
        category.boulders.forEach(boulder => {
          advanceBoulder(boulder, category);
        });
      });
      console.log(`[${new Date().toISOString()}] All climbers advanced by ${clientId}`);
      io.emit('categories-sync', timerState.categories);
      saveCategories();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error advancing all climbers:`, error);
    }
  });

  // Listen for boulder hold toggle
  socket.on('toggle-boulder-hold', (data) => {
    try {
      const { categoryId, boulderId } = data;
      const category = timerState.categories.find(c => c.id === categoryId);
      if (category) {
        const boulder = category.boulders.find(b => b.boulderId === boulderId);
        if (boulder) {
          boulder.held = !boulder.held;
          console.log(`[${new Date().toISOString()}] Boulder ${boulderId} in ${category.name} ${boulder.held ? 'held' : 'released'} by ${clientId}`);
          io.emit('categories-sync', timerState.categories);
          saveCategories();
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error toggling boulder hold:`, error);
    }
  });

  // Listen for reset category progress (clears completion tracking)
  socket.on('reset-category-progress', (categoryId) => {
    try {
      const category = timerState.categories.find(c => c.id === categoryId);
      if (category) {
        // Reset climber progress tracking
        category.climberProgress = {};
        // Reset all boulder indices to 0 and hasStarted to false
        category.boulders.forEach(boulder => {
          boulder.currentClimberIndex = 0;
          boulder.hasStarted = false;
        });
        console.log(`[${new Date().toISOString()}] Category progress reset by ${clientId}: ${category.name}`);
        io.emit('categories-sync', timerState.categories);
        saveCategories();
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error resetting category progress:`, error);
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
