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
  remaining: 240
};

// Track connected clients
let connectedClients = 0;

io.on('connection', (socket) => {
  connectedClients++;
  const clientId = socket.id.substring(0, 8);
  console.log(`[${new Date().toISOString()}] Client ${clientId} connected. Total: ${connectedClients}`);

  // Send the current timer state to the newly connected client
  socket.emit('timer-sync', timerState);

  // Broadcast the updated client count to all clients
  io.emit('client-count', connectedClients);

  // Listen for timer state updates from any client
  socket.on('timer-update', (newState) => {
    try {
      // Validate incoming state
      if (typeof newState === 'object' && newState !== null) {
        // Update the server's state
        timerState = { ...timerState, ...newState };

        // Broadcast the new state to all OTHER clients (not the sender)
        socket.broadcast.emit('timer-sync', timerState);

        console.log(`[${new Date().toISOString()}] Timer updated by ${clientId}: phase=${timerState.phase}, remaining=${timerState.remaining}`);
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
