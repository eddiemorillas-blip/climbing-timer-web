# Climbing Competition Timer - Cloud Web Application

A production-ready, real-time climbing competition timer that syncs across unlimited devices worldwide using WebSockets (Socket.IO). Access from anywhere via a public URL.

## Features

- **Global real-time synchronization** - All connected devices stay perfectly synced
- **Cloud-hosted** - Access from anywhere with internet connection
- **Production-ready** - Error handling, health checks, graceful shutdown
- **Climbing & Transition phases** - Automatically cycles between periods
- **Audio feedback** - Beeps at 1:00, countdown at 5-4-3-2-1, and buzzer at end
- **Fullscreen mode** - Clean display for projectors/screens
- **Connection status** - Visual indicator showing connection state
- **Client counter** - See how many devices are connected worldwide
- **Configurable timers** - Adjust climbing and transition times on the fly
- **Free hosting** - Deploy to Render, Railway, or Fly.io

## Quick Start - Cloud Deployment (Recommended)

### Deploy to Render (Free, 5 minutes)

1. **Push to GitHub:**
   ```bash
   cd /home/emorillas/climbing-timer-web
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR-USERNAME/climbing-timer-web.git
   git push -u origin main
   ```

2. **Deploy on Render:**
   - Go to https://render.com and sign up
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - Name: `climbing-timer`
     - Build Command: `npm install`
     - Start Command: `npm start`
   - Click "Create Web Service"

3. **Access Your Timer:**
   - Your URL: `https://climbing-timer.onrender.com`
   - Share this URL with anyone, anywhere!

**📖 Full deployment guide:** See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions

## Local Development

### Prerequisites

- Node.js 18+ and npm 9+
- Git

### Installation

```bash
cd climbing-timer-web
npm install
```

### Run Locally

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server starts on `http://localhost:3000`

### Test on Local Network

1. Find your computer's IP address:
   - **Windows**: `ipconfig` in Command Prompt
   - **Mac**: `ifconfig` in Terminal
   - **Linux**: `ip addr` in Terminal

2. Access from other devices on same WiFi:
   ```
   http://YOUR-IP-ADDRESS:3000
   ```

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Cloud Server (Render/Railway/Fly.io)          │
│  ┌───────────────────────────────────────────┐ │
│  │  Express Server + Socket.IO               │ │
│  │  - Maintains authoritative timer state    │ │
│  │  - Broadcasts updates to all clients      │ │
│  │  - Health monitoring                      │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
                      ↕️ WebSocket
    ┌─────────────────┼─────────────────┐
    │                 │                 │
┌───▼───┐        ┌───▼───┐        ┌───▼───┐
│Client │        │Client │        │Client │
│  #1   │        │  #2   │        │  #3   │
│Browser│        │ Phone │        │Tablet │
└───────┘        └───────┘        └───────┘
  Gym              Home           Competition
```

### Server (`server.js`)

- **Express web server** serves the HTML/CSS/JS files
- **Socket.IO** handles WebSocket connections for real-time sync
- **Authoritative state** - Server maintains the single source of truth
- **Broadcasting** - State changes sent to all connected clients
- **Health monitoring** - `/health` endpoint for uptime checks
- **Error handling** - Graceful shutdown, uncaught exception handling

### Client (`public/index.html`)

- **Socket.IO client** connects to the server
- **Emits updates** when user clicks Start/Pause/Reset
- **Receives updates** from other clients in real-time
- **Connection status** shows green when connected
- **Sync prevention** flag prevents infinite loops

### Synced State

All clients stay synchronized on:
- **Timer configuration** - Climb time, transition time
- **Current phase** - Stopped, Climb, or Transition
- **Remaining time** - Current countdown value
- **Running status** - Whether timer is actively counting

## API Endpoints

### `GET /`
Serves the main timer application

### `GET /health`
Health check endpoint for monitoring

**Response:**
```json
{
  "status": "healthy",
  "uptime": 123.456,
  "connectedClients": 5,
  "timestamp": "2025-10-25T18:00:00.000Z"
}
```

### `GET /api/state`
Get current timer state and client count

**Response:**
```json
{
  "state": {
    "climbMin": 4,
    "climbSec": 0,
    "transMin": 1,
    "transSec": 0,
    "phase": "climb",
    "running": true,
    "remaining": 180
  },
  "connectedClients": 5
}
```

## WebSocket Events

### Client → Server

- `timer-update` - Update timer state (start/pause/reset)
- `config-update` - Update timer configuration (time settings)

### Server → Client

- `timer-sync` - Broadcast updated timer state
- `config-sync` - Broadcast updated configuration
- `client-count` - Broadcast number of connected clients

## Project Structure

```
climbing-timer-web/
├── server.js              # Express + Socket.IO server (production-ready)
├── package.json           # Dependencies and scripts
├── public/
│   └── index.html         # Web app with Socket.IO client
├── README.md             # This file
├── DEPLOYMENT.md         # Detailed deployment guide
└── .gitignore           # Git ignore file
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (cloud providers set automatically) |
| `NODE_ENV` | `development` | Environment mode (`development` or `production`) |

## Production Features

### Error Handling
- ✅ Try-catch blocks on all Socket.IO events
- ✅ Input validation for state updates
- ✅ Graceful shutdown on SIGTERM/SIGINT
- ✅ Uncaught exception handling
- ✅ Unhandled promise rejection handling

### Logging
- ✅ Timestamped logs with ISO 8601 format
- ✅ Client ID tracking (first 8 chars of socket ID)
- ✅ Connection/disconnection events
- ✅ State change events
- ✅ Error events

### Performance
- ✅ CORS configured for WebSocket connections
- ✅ Ping/pong interval: 25s, timeout: 60s
- ✅ Efficient state broadcasting (sender excluded)
- ✅ Minimal memory footprint

### Monitoring
- ✅ `/health` endpoint for uptime checks
- ✅ `/api/state` endpoint for state inspection
- ✅ Connected clients tracking
- ✅ Uptime reporting

## Deployment Options

| Platform | Cost | Setup Time | Pros | Cons |
|----------|------|------------|------|------|
| **Render** | Free or $7/mo | 5 min | Easy, no CC required | Spins down after 15 min (free tier) |
| **Railway** | $5 credit/mo | 3 min | Fast, good free tier | Requires credit card |
| **Fly.io** | Free tier | 10 min | Global CDN, very fast | More complex setup |

**Recommendation:**
- **For testing:** Render free tier (perfect for competitions)
- **For production:** Render $7/month (always-on, no spin-down)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions for each platform.

## Use Cases

### Competition Day
1. Deploy to cloud (5 minutes)
2. Share URL with:
   - Judges (tablets)
   - Display screens (projectors)
   - Climbers (phones)
   - Remote viewers (anywhere)
3. Anyone can control the timer
4. Everyone stays perfectly synchronized

### Training Sessions
1. Open timer on gym projector
2. Coaches access from phones
3. Athletes see countdown on screens
4. Remote coaches can participate

### Multi-Location Events
1. Deploy once
2. Access from multiple gyms simultaneously
3. All locations stay synchronized
4. Central control or distributed control

## Testing Real-Time Sync

1. **Deploy to cloud** (or run locally)
2. **Open timer on Device A** (computer)
3. **Open same URL on Device B** (phone)
4. **Open same URL on Device C** (tablet)
5. **Click "Start" on Device A** → All devices start instantly!
6. **Click "Pause" on Device B** → All devices pause instantly!
7. **Change time on Device C** → All devices update instantly!

Perfect synchronization across the globe! 🌍

## Troubleshooting

### App Won't Load
- Check server logs in Render dashboard
- Verify deployment succeeded (green "Live" status)
- Wait 30-60 seconds if free tier (spin-up time)

### Not Syncing
- Check connection status indicator (should be green)
- Open browser console (F12) and check for errors
- Verify multiple clients show same client count
- Check `/api/state` endpoint to see server state

### Audio Not Playing
- Modern browsers require user gesture
- Click "Start" or "Test Sound" at least once
- Check device volume settings

### Deployment Failed
- Check Render logs for error messages
- Verify Node.js version (18+) in package.json
- Ensure all dependencies are listed
- Check that PORT is `process.env.PORT`

## Development

### Local Development Mode

```bash
npm run dev
```

Features:
- Shows detailed URLs in console
- Development environment logs
- Hot reload (manual restart)

### Production Mode (Local)

```bash
npm start
```

Features:
- Production environment
- Minimal logging
- Production-optimized

### Testing Socket.IO

Open browser console and test:

```javascript
// Check connection status
socket.connected  // Should be true

// Emit test event
socket.emit('timer-update', {
  phase: 'climb',
  running: true,
  remaining: 240
});

// Listen for events
socket.on('timer-sync', (state) => {
  console.log('Received state:', state);
});
```

## Security Notes

- ✅ No authentication (by design for public competitions)
- ✅ State validation on server
- ✅ CORS configured appropriately
- ⚠️ Anyone with URL can control timer (feature, not bug)
- 💡 For private use, add authentication layer

## Contributing

Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Share with your climbing community

## License

MIT

## Original Timer

The original single-file HTML timer is preserved at:
`C:\Users\EddieMorillas\OneDrive - The Front Climbing Club\Desktop\climbing_timer.html`

This version adds:
- ✅ Cloud hosting capability
- ✅ Global real-time sync
- ✅ Production-grade error handling
- ✅ Health monitoring
- ✅ API endpoints

While maintaining all original features:
- ✅ Audio feedback
- ✅ Fullscreen mode
- ✅ Configurable timers
- ✅ Beautiful UI

---

**Made for climbers, by climbers 🧗**

Access your timer from anywhere: `https://your-timer.onrender.com`
