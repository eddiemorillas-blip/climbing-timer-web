# Climbing Competition Timer - Setup Guide

A comprehensive guide for setting up and running the climbing competition timer for boulder competitions.

## Table of Contents

1. [Overview](#overview)
2. [Before the Competition](#before-the-competition)
3. [Competition Day Setup](#competition-day-setup)
4. [Configuring Categories and Climbers](#configuring-categories-and-climbers)
5. [Understanding the Screens](#understanding-the-screens)
6. [Running the Competition](#running-the-competition)
7. [Display Settings](#display-settings)
8. [How Climber Rotation Works](#how-climber-rotation-works)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This timer is designed for boulder climbing competitions with the following format:
- **4 boulders** running simultaneously
- **Up to 4 categories** (e.g., Women 18-24, Men 25-34, etc.)
- **Rotating climbers** - climbers progress through boulders B1 → B2 → B3 → B4
- **Cascading starts** - boulders start progressively to give climbers rest between boulders
- **Real-time sync** - all connected devices (judges, displays, spectators) stay synchronized

---

## Before the Competition

### 1. Prepare Your Climber Lists

Create an Excel file with your climbers organized by category:

| Women 18-24 | Women 25-34 | Men 18-24 | Men 25-34 |
|-------------|-------------|-----------|-----------|
| Sarah Johnson | Emily Davis | Mike Smith | John Brown |
| Lisa Chen | Amy Wilson | Tom Lee | Dave Miller |
| Maria Garcia | Kate Taylor | Chris Park | Alex Jones |

**Rules:**
- Column headers = category names
- Each row = one climber
- Maximum 4 categories (columns)
- Unlimited climbers per category

Save as `.xlsx` or `.xls` file.

### 2. Plan Your Timer Settings

Typical competition settings:
- **Climb Time**: 4 minutes (4:00)
- **Transition Time**: 1 minute (1:00)

Adjust based on your competition format:
- Youth competitions: 3:00 - 4:00 climb time
- Adult competitions: 4:00 - 5:00 climb time
- Speed rounds: 2:00 climb time
- Transition: 30 seconds to 2 minutes depending on boulder spacing

---

## Competition Day Setup

### Step 1: Start the Server

**Option A: Cloud Hosted (Recommended)**
- Navigate to your deployed URL: `https://your-timer.onrender.com`
- No setup required - it's always running

**Option B: Local Server**
```bash
cd climbing-timer-web
npm start
```
Server will start at `http://localhost:3000`

### Step 2: Open the Operator Screen

1. Open your browser
2. Navigate to your timer URL
3. This is the **Operator Screen** - where you control everything

### Step 3: Open Display Screens

For each projector/monitor at the competition:

1. Click the **"Open Display"** button (top-right of operator screen)
2. A new window opens with the **Display Screen**
3. Click **"Fullscreen"** button for a clean display
4. The display shows:
   - Large timer (70% of screen)
   - Climber grid (30% of screen) showing who's on each boulder

**Tip:** Open one display window, then drag it to your external monitor/projector.

### Step 4: Connect Judge Devices

Have judges open the same URL on their phones/tablets:
1. Share the URL via QR code, text, or email
2. All devices will sync automatically
3. Connection status indicator shows green when connected

---

## Configuring Categories and Climbers

### Method 1: Excel Import (Recommended)

1. Click the purple **"Excel"** button in the Config panel
2. Select your prepared Excel file
3. The system will:
   - Read category names from column headers
   - Import all climbers from each column
   - Create categories with climber rosters
4. Confirmation shows: "Successfully imported X categories with Y total climbers"

### Method 2: Manual Entry

1. Click **"+ Add"** to create a new category
2. Click the **arrow (▼)** to expand the category
3. Enter category name (e.g., "Women 18-24")
4. In the text area, enter climber names **one per line**:
   ```
   Sarah Johnson
   Lisa Chen
   Maria Garcia
   ```
5. Click **"Save List"** to save the climbers
6. Repeat for each category (max 4)

### Editing Categories

- **Rename**: Click the category name field and edit it
- **Update climbers**: Expand the category, edit the text area, click "Save List"
- **Delete**: Click the red "Delete" button
- **Reset progress**: Click "Reset" to start over (clears who has climbed which boulder)

---

## Understanding the Screens

### Operator Screen

The operator screen has two main sections:

**Left: Timer Card**
- Phase indicator (Ready / CLIMB / TRANSITION)
- Large countdown display
- Control buttons: Start, Pause, Reset, Skip
- Climber grid showing current climbers on each boulder

**Right: Config Panel**
- Climb Time: Minutes and seconds
- Transition Time: Minutes and seconds
- Show Names toggle: Turn climber grid on/off
- Categories list: Manage your competition categories

### Display Screen

Designed for projectors and large displays:

**Top (70%): Timer**
- Phase label with color coding:
  - Gray: Ready (not started)
  - Green: CLIMB
  - Orange: TRANSITION
- Massive countdown timer

**Bottom (30%): Climber Grid**
- Shows current climber on each boulder
- Format: `B1 · Category Name` followed by climber name
- "—" means no climber yet (boulder hasn't started)
- "DONE" means all climbers in that category completed all boulders

---

## Running the Competition

### Starting the Competition

1. Verify all climbers are imported correctly
2. Set your climb and transition times
3. Position climbers at Boulder 1 (all categories start at B1)
4. Click **"Start"** to begin

### During Climb Phase

- Timer counts down from climb time (e.g., 4:00)
- Audio beep at 1 minute remaining
- Countdown beeps at 5, 4, 3, 2, 1
- Buzzer sounds at 0:00
- Climbers rotate automatically when phase ends

### During Transition Phase

- Timer counts down from transition time (e.g., 1:00)
- Climbers move to their next boulder
- Phase automatically switches back to climb when transition ends

### Pausing

- Click **"Pause"** to stop the timer
- Click **"Resume"** to continue
- All connected devices pause/resume together

### Skipping Phase

- Click **"Skip"** to immediately end the current phase
- Useful if all climbers finish early
- Timer will advance to next phase

### Resetting

- Click **"Reset"** to stop timer and reset to climb time
- Does NOT reset climber progress
- Use the category "Reset" button to reset climber positions

---

## Display Settings

### Show/Hide Athlete Names

Toggle the **"Show Names"** checkbox in the Config panel to:
- **ON**: Display climber grid on operator and display screens
- **OFF**: Hide climber names for privacy or cleaner display

This setting syncs to all connected devices instantly.

### Fullscreen Mode

On the display screen:
1. Click the **"Fullscreen"** button (top-right)
2. Press **Esc** to exit fullscreen
3. The button auto-hides in fullscreen but reappears on hover

---

## How Climber Rotation Works

### The Basics

- Each category has climbers who rotate through all 4 boulders
- All climbers start at B1, then progress to B2, B3, B4
- At each climb phase end, climbers automatically advance

### Cascading Start System

To ensure climbers get rest between boulders:

1. **B1 starts immediately** - first climber begins on round 1
2. **B2 waits** until B1 has advanced at least 2 times
3. **B3 waits** until B2 has advanced at least 2 times
4. **B4 waits** until B3 has advanced at least 2 times

This ensures each climber has at least one full round of rest between boulders.

**Example with 3 climbers (A, B, C):**

| Round | B1 | B2 | B3 | B4 |
|-------|----|----|----|----|
| 1 | A | — | — | — |
| 2 | B | — | — | — |
| 3 | C | A | — | — |
| 4 | — | B | — | — |
| 5 | — | C | A | — |
| 6 | — | — | B | — |
| 7 | — | — | C | A |
| 8 | — | — | — | B |
| 9 | — | — | — | C |

### Completion Tracking

- System tracks which boulders each climber has completed
- Once a climber finishes all 4 boulders, they're marked "complete"
- Completed climbers are skipped in the rotation
- "DONE" displays when all climbers in a category have finished

---

## Troubleshooting

### Timer Not Syncing Across Devices

1. Check the connection status indicator (should be green)
2. Verify all devices are on the same URL
3. Check internet connection
4. Try refreshing the page

### Audio Not Playing

1. Click "Sound" button to test audio
2. Modern browsers require user interaction first
3. Check device volume settings
4. Some browsers block autoplay - start timer manually first

### Climbers Not Advancing

1. Timer must complete (reach 0:00) for auto-advance
2. Or manually click "Skip" to advance phase
3. Check if all climbers are marked complete (shows "DONE")

### Display Shows Wrong Climber

1. Check the category is correct
2. Verify climber list is in correct order
3. Use "Reset" in category settings to start over
4. Remember: cascading starts mean some boulders show "—" initially

### Excel Import Failed

1. Check file format (.xlsx or .xls only)
2. Verify column headers exist (category names)
3. Ensure at least one data row
4. Maximum 4 columns (categories)
5. Check for special characters in names

### Connection Lost

1. The status indicator will turn red
2. Wait for automatic reconnection
3. If persistent, refresh the page
4. Check server is still running (for local setup)

### Free Tier Spin-Down (Cloud Hosting)

If using Render's free tier:
1. First visit after 15 min inactivity takes 30-60s
2. Open the URL a few minutes before the competition starts
3. Consider upgrading to paid tier for competition day ($7/month)

---

## Quick Reference

### Keyboard Shortcuts (Display Screen)

- **Esc**: Exit fullscreen

### Timer Controls

| Button | Action |
|--------|--------|
| Start | Begin timer, enter climb phase |
| Pause | Stop countdown (all devices) |
| Resume | Continue from paused time |
| Reset | Stop and reset to climb time |
| Skip | Jump to next phase immediately |
| Sound | Test audio feedback |

### Status Colors

| Phase | Color |
|-------|-------|
| Ready | Gray |
| CLIMB | Green |
| TRANSITION | Orange |

### Climber Grid Symbols

| Symbol | Meaning |
|--------|---------|
| Name | Climber currently on this boulder |
| — | Boulder hasn't started yet |
| DONE | All climbers completed this boulder |

---

## Support

- Check the connection status indicator
- View server logs for debugging
- Refer to README.md for technical details
- See DEPLOYMENT.md for hosting options

**Happy Climbing!**
