const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

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

// Store the current timer state on the server
let timerState = {
  climbMin: 4,
  climbSec: 0,
  transMin: 1,
  transSec: 0,
  phase: 'stopped',
  running: false,
  remaining: 240,
  categories: []
  // categories structure:
  // [
  //   {
  //     id: 1,
  //     name: "Women 18-24",
  //     boulders: [
  //       { boulderId: 1, climbers: ["Name1", "Name2", ...], currentClimberIndex: 0 },
  //       { boulderId: 2, climbers: ["Name1", "Name2", ...], currentClimberIndex: 0 },
  //       { boulderId: 3, climbers: ["Name1", "Name2", ...], currentClimberIndex: 0 },
  //       { boulderId: 4, climbers: ["Name1", "Name2", ...], currentClimberIndex: 0 }
  //     ]
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
          boulder.currentClimberIndex = (boulder.currentClimberIndex + 1) % boulder.climbers.length;
          console.log(`[${new Date().toISOString()}] Climber advanced by ${clientId}: ${category.name} - Boulder ${boulderId}`);
          io.emit('categories-sync', timerState.categories);
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
        if (boulder && boulder.climbers.length > 0) {
          boulder.currentClimberIndex = (boulder.currentClimberIndex + 1) % boulder.climbers.length;
        }
      });
      console.log(`[${new Date().toISOString()}] All climbers advanced on Boulder ${boulderId} by ${clientId}`);
      io.emit('categories-sync', timerState.categories);
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
          if (boulder.climbers.length > 0) {
            boulder.currentClimberIndex = (boulder.currentClimberIndex + 1) % boulder.climbers.length;
          }
        });
        console.log(`[${new Date().toISOString()}] All climbers advanced in category ${category.name} by ${clientId}`);
        io.emit('categories-sync', timerState.categories);
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
          if (boulder.climbers.length > 0) {
            boulder.currentClimberIndex = (boulder.currentClimberIndex + 1) % boulder.climbers.length;
          }
        });
      });
      console.log(`[${new Date().toISOString()}] All climbers advanced by ${clientId}`);
      io.emit('categories-sync', timerState.categories);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error advancing all climbers:`, error);
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
