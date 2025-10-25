# Quick Start Guide - 5 Minutes to Production

Deploy your climbing timer to the cloud in 5 minutes and share it globally!

## Prerequisites

- GitHub account
- Render account (sign up free at https://render.com)

## Step-by-Step Deployment

### 1. Push to GitHub (2 minutes)

```bash
# Navigate to project
cd /home/emorillas/climbing-timer-web

# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Deploy climbing timer to cloud"

# Create repository on GitHub at: https://github.com/new
# Name it: climbing-timer-web
# Don't initialize with README

# Add remote and push
git remote add origin https://github.com/YOUR-USERNAME/climbing-timer-web.git
git branch -M main
git push -u origin main
```

### 2. Deploy on Render (3 minutes)

1. **Sign up/Login**: Go to https://render.com

2. **Create Web Service**:
   - Click **"New +"** button (top right)
   - Select **"Web Service"**

3. **Connect Repository**:
   - Click **"Connect account"** for GitHub
   - Authorize Render
   - Find **"climbing-timer-web"** in the list
   - Click **"Connect"**

4. **Configure**:
   ```
   Name:           climbing-timer
   Region:         Oregon (US West) or closest to you
   Branch:         main
   Root Directory: (leave blank)
   Runtime:        Node
   Build Command:  npm install
   Start Command:  npm start
   Instance Type:  Free
   ```

5. **Environment Variables** (Optional):
   - Click **"Advanced"**
   - Add: `NODE_ENV` = `production`

6. **Deploy**:
   - Click **"Create Web Service"**
   - Wait 2-5 minutes for deployment

### 3. Access Your Timer

Your timer will be live at:
```
https://climbing-timer.onrender.com
```
(or whatever name you chose)

### 4. Test It!

1. Open the URL in your browser
2. Open the same URL on your phone
3. Click "Start" on one device
4. Watch it update on all devices instantly!

## Share Your Timer

Send this URL to:
- Judges
- Coaches
- Athletes
- Display screens
- Anyone, anywhere in the world!

Everyone will stay perfectly synchronized.

## What's Next?

- ✅ **Works immediately** - Free tier is perfect for competitions
- ⚠️ **15-minute spin-down** on free tier (30s wake-up time)
- 🚀 **Upgrade to $7/month** for always-on (no spin-down)

## Troubleshooting

**"App not loading"**
- Wait 30-60 seconds (free tier spin-up)
- Check Render dashboard for green "Live" status

**"Not syncing"**
- Check connection status (green dot in top right)
- Open browser console (F12) for errors

**"Deployment failed"**
- Check Render logs tab for errors
- Verify all files were pushed to GitHub

## Commands Reference

```bash
# View server logs (in Render dashboard)
Logs tab → Real-time logs

# Update your app
git add .
git commit -m "Update timer"
git push
# Render auto-deploys in 2-3 minutes

# Check health
curl https://your-timer.onrender.com/health

# Check current state
curl https://your-timer.onrender.com/api/state
```

## Cost Breakdown

| Tier | Cost | Best For |
|------|------|----------|
| Free | $0 | Testing, occasional competitions |
| Paid | $7/month | Frequent use, always-on |

**Tip**: Deploy on free tier, upgrade for competition day only!

## Done!

Your timer is now accessible worldwide at:
```
https://your-timer.onrender.com
```

Share this URL and enjoy perfectly synchronized timing across the globe! 🧗🌍

---

**Need more details?** See [DEPLOYMENT.md](./DEPLOYMENT.md) for comprehensive guide.

**Having issues?** Check [README.md](./README.md) troubleshooting section.
