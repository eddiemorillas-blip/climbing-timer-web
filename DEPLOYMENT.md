# Cloud Deployment Guide - Render.com

This guide will walk you through deploying your Climbing Timer to Render's free tier, making it accessible from anywhere on the internet.

## Prerequisites

1. A GitHub account (or GitLab/Bitbucket)
2. A Render account (free) - Sign up at https://render.com
3. Your code pushed to a Git repository

## Step 1: Prepare Your Repository

### Option A: Create a New GitHub Repository

1. Go to https://github.com/new
2. Create a new repository (e.g., `climbing-timer-web`)
3. Don't initialize with README (we already have files)

### Option B: Push to Existing Repository

In your project directory:

```bash
cd /home/emorillas/climbing-timer-web

# Initialize git (if not already)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Climbing timer with Socket.IO"

# Add your remote repository
git remote add origin https://github.com/YOUR-USERNAME/climbing-timer-web.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Render

### 2.1 Create a New Web Service

1. Go to https://render.com and log in
2. Click **"New +"** in the top right
3. Select **"Web Service"**

### 2.2 Connect Your Repository

1. Connect your GitHub account (if first time)
2. Find and select your `climbing-timer-web` repository
3. Click **"Connect"**

### 2.3 Configure Your Service

Fill in the following settings:

**Basic Settings:**
- **Name**: `climbing-timer` (or your preferred name)
- **Region**: Choose closest to your location
- **Branch**: `main`
- **Root Directory**: (leave blank)
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

**Instance Type:**
- Select **"Free"** (or paid tier for better performance)

**Environment Variables:**
- Click **"Advanced"** to expand
- Add environment variable:
  - Key: `NODE_ENV`
  - Value: `production`

### 2.4 Deploy

1. Click **"Create Web Service"** at the bottom
2. Render will automatically:
   - Clone your repository
   - Install dependencies
   - Start your server
3. Wait 2-5 minutes for deployment to complete

### 2.5 Get Your URL

Once deployed, you'll see your app URL at the top:
```
https://climbing-timer.onrender.com
```

Or whatever name you chose: `https://YOUR-SERVICE-NAME.onrender.com`

## Step 3: Test Your Deployment

### 3.1 Open Your App

1. Click the URL at the top of your Render dashboard
2. Your climbing timer should load!

### 3.2 Test Real-Time Sync

1. Open the URL in multiple browser tabs
2. Open it on your phone
3. Share the URL with friends
4. Test that clicking Start/Pause/Reset on one device updates all others instantly!

### 3.3 Check Health Status

Visit your health endpoint:
```
https://YOUR-APP.onrender.com/health
```

You should see:
```json
{
  "status": "healthy",
  "uptime": 123.456,
  "connectedClients": 2,
  "timestamp": "2025-10-25T18:00:00.000Z"
}
```

## Step 4: Monitor Your Application

### View Logs

1. In your Render dashboard, click on your service
2. Click the **"Logs"** tab
3. You'll see:
   - Connection events
   - Timer updates
   - Client connections/disconnections

### Check Status

1. Click **"Events"** tab to see deployment history
2. Click **"Metrics"** to see CPU/Memory usage (paid plans)

## Important Notes

### Free Tier Limitations

**Render's free tier:**
- ✅ Free forever
- ✅ Automatic HTTPS
- ✅ Automatic deploys from Git
- ⚠️ **Spins down after 15 minutes of inactivity**
- ⚠️ **Takes 30-60 seconds to wake up on first request**
- ⏱️ 750 hours/month (enough for continuous use)

**What "spin down" means:**
- After 15 minutes with no connections, the server sleeps
- First visitor has to wait ~30 seconds for it to wake up
- After that, it's instant for everyone
- Great for competitions (everyone connects at start)
- Consider paid tier ($7/month) for always-on service

### Automatic Deploys

Any time you push to GitHub, Render automatically redeploys:

```bash
# Make changes to your code
git add .
git commit -m "Update timer settings"
git push

# Render will automatically redeploy in 2-3 minutes
```

### Custom Domain (Optional)

To use your own domain (e.g., `timer.yourclub.com`):

1. In Render dashboard, go to Settings
2. Click **"Custom Domain"**
3. Add your domain
4. Update your DNS records as instructed
5. Render provides free SSL certificate

## Troubleshooting

### Deployment Failed

1. Check the **Logs** tab for error messages
2. Common issues:
   - Wrong Node version → Update `engines` in package.json
   - Missing dependencies → Run `npm install` locally first
   - Port issues → Make sure you use `process.env.PORT`

### Can't Connect to Timer

1. Check service is "Live" (green) in dashboard
2. If just deployed, wait 30 seconds for spin-up
3. Check browser console (F12) for errors
4. Verify WebSocket connection in Network tab

### Timer Not Syncing

1. Check Render logs for connection errors
2. Verify multiple clients are connected (check /api/state)
3. Check browser console for Socket.IO errors
4. Ensure your browser allows WebSocket connections

### App is Slow

1. Free tier spins down after inactivity
2. First request takes 30-60 seconds to wake up
3. Consider upgrading to paid tier ($7/month) for always-on
4. Or use a "keep-alive" service (ping /health every 10 minutes)

## Alternative Deployment Platforms

### Railway (Alternative to Render)

**Pros:**
- Faster spin-up time
- Better free tier
- Simpler interface

**Cons:**
- Free tier requires credit card
- $5/month credit (usually enough)

**Deploy to Railway:**
1. Go to https://railway.app
2. Click "Start a New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway auto-detects Node.js and deploys

### Fly.io (Advanced Option)

**Pros:**
- Global edge network
- Very fast
- More free tier resources

**Cons:**
- Requires credit card
- Slightly more complex setup
- Uses CLI for deployment

**Deploy to Fly.io:**
```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch app (in project directory)
cd /home/emorillas/climbing-timer-web
fly launch

# Follow prompts, then deploy
fly deploy
```

## Cost Comparison

| Platform | Free Tier | Paid Tier | Pros | Cons |
|----------|-----------|-----------|------|------|
| **Render** | ✅ True free<br>Spins down | $7/month<br>Always on | Easy setup<br>No credit card | Slow wake-up |
| **Railway** | $5 credit/month<br>CC required | $5/month | Fast<br>Good free tier | Requires CC |
| **Fly.io** | 3 small VMs<br>CC required | Pay as you go | Global CDN<br>Very fast | Complex setup |

## Recommended Setup

**For Development/Testing:**
- Use Render's free tier
- Perfect for occasional use
- Share URL when needed

**For Live Competitions:**
- Upgrade to paid tier day of event ($7 one-time)
- Or use Railway with free credit
- Ensures no spin-down during event

**For Always-On Production:**
- Render paid tier ($7/month)
- Or Railway ($5/month)
- Always responsive

## Next Steps

1. ✅ Deploy to Render following steps above
2. 📱 Test from multiple devices
3. 🔗 Share the URL with your team
4. 📊 Monitor usage in Render dashboard
5. 🚀 Upgrade to paid tier when ready for production

## Support

**Render Documentation:**
- https://render.com/docs

**Socket.IO Documentation:**
- https://socket.io/docs/v4/

**Need Help?**
- Check Render logs first
- Review the troubleshooting section above
- Open an issue in your GitHub repository
