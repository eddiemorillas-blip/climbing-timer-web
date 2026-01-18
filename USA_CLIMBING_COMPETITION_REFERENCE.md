# USA Climbing Competition Format Reference

This document provides reference information about USA Climbing competition formats, categories, and timing requirements that are relevant for the climbing timer application.

## Official Rulebook

**USA Climbing Rulebook 2025-2026 (Provisional)**
- Download: https://usaclimbing.org/wp-content/uploads/2025/10/USA_Climbing_Rulebook_2025-2026.20251001.provisional.pdf
- Official Website: https://usaclimbing.org/

## Competition Categories

USA Climbing competitions typically use age-based and gender-based categories:

### Age Categories (Common)

**Youth Categories:**
- Youth D: 10 and under
- Youth C: 11-12
- Youth B: 13-14
- Youth A: 15-16
- Junior: 17-19

**Adult Categories:**
- Open: 18-29
- Masters: 30+
- Age subcategories: 18-24, 25-29, 30-39, 40-49, 50-59, 60+

**Gender Categories:**
- Female
- Male
- Non-binary (at some events)

### Common Category Examples for Timer Display

Based on the 4-category setup in this app, typical competition scenarios might include:

**Scenario 1: Youth Mixed Event**
1. Youth B Female (13-14)
2. Youth B Male (13-14)
3. Youth A Female (15-16)
4. Youth A Male (15-16)

**Scenario 2: Adult Open Event**
1. Women 18-24
2. Men 18-24
3. Women 25-35
4. Men 25-35

**Scenario 3: Masters Event**
1. Women 30-39
2. Men 30-39
3. Women 40-49
4. Men 40-49

## Boulder Competition Format

### Standard Boulder Round Structure

**Number of Problems:**
- Qualification/Semi-Final: Usually 4-5 boulder problems
- Finals: Usually 4 boulder problems

**Time Limits:**
- **Climbing Time**: 4-5 minutes per boulder (most common: 4 minutes)
- **Transition Time**: 1-2 minutes between boulders (most common: 1 minute)
- **Rest Between Rounds**: 15-30 minutes minimum

### Rotation Formats

**Format 1: Group Rotation (Most Common)**
- All climbers in a category rotate through all boulders together
- All climbers climb Boulder 1, then all move to Boulder 2, etc.
- Timer applies to all climbers simultaneously

**Format 2: Individual Rotation**
- Climbers climb one at a time
- Each climber gets individual timer for each boulder
- More common in finals or small groups

**Format 3: Heat-Based Rotation**
- Categories split into heats
- Each heat rotates through boulders on a schedule
- Multiple timers may run simultaneously

### Competition Flow

1. **Observation Period** (2 minutes typical)
   - Climbers observe the boulder problem
   - No climbing allowed

2. **Climbing Phase** (4 minutes typical)
   - Timer starts
   - Audio signals at specific times (1:00 remaining, 5-4-3-2-1 countdown)
   - Buzzer at time expiration

3. **Transition Phase** (1 minute typical)
   - Climbers move to next boulder
   - Quick break for chalk, water, etc.

4. **Repeat** for all 4 boulders

## Timing Requirements

### Audio Signals (Current App Implementation)

**During Climb Phase:**
- **1:00 remaining**: Single beep (800 Hz)
- **0:05 - 0:01**: Short beeps (1200 Hz, square wave)
- **0:00**: Buzzer sound (complex tone with noise)

**Phase Transitions:**
- **Start of climb**: Gentle start tone (660 Hz triangle wave)
- **End of climb**: Distinct buzzer

### Visual Display Requirements

**Essential Information:**
- Large, readable countdown timer
- Current phase (Ready/Climb/Transition)
- Clear start/stop controls

**Spectator Display (Implemented):**
- Climber names for all active positions
- Category identification
- Boulder number
- Progress indicator (e.g., "3/15" = 3rd climber out of 15)

## Scoring System (For Reference)

While not directly relevant to the timer, understanding scoring helps with competition flow:

**Scoring Metrics:**
- **Tops**: Successfully completing the boulder (reaching the final hold)
- **Zones**: Reaching an intermediate hold on the boulder
- **Attempts**: Number of tries to reach top/zone

**Ranking:**
1. Most tops (primary)
2. Fewest attempts to top (tiebreaker)
3. Most zones (tiebreaker)
4. Fewest attempts to zone (tiebreaker)

## Competition Setup Recommendations

### For Local Competitions

**Typical Setup:**
- 2-4 categories running simultaneously
- 4 boulder problems set
- 4-5 minute climb time
- 1-2 minute transition time

**Category Limits:**
- Maximum 4 categories for simultaneous display (app limit)
- 10-20 climbers per category (typical)
- Stagger start times if more categories are needed

### For Larger Events

**Heat Management:**
- Split large categories into heats
- Run heats sequentially or on different courses
- Multiple timer instances may be needed

## Timer Application Usage Scenarios

### Scenario 1: Small Local Competition
- **Categories**: 2-3 (e.g., Youth B M/F, Youth A M/F)
- **Climbers**: 10-15 per category
- **Boulder Count**: 4
- **Display**: 2×4 or 3×4 grid (8-12 names on screen)

### Scenario 2: Medium Regional Competition
- **Categories**: 4 (e.g., Open Women, Open Men, Masters Women, Masters Men)
- **Climbers**: 15-20 per category
- **Boulder Count**: 4
- **Display**: 4×4 grid (16 names on screen)

### Scenario 3: Championship Finals
- **Categories**: 1 (Finals for specific category)
- **Climbers**: 6-8 finalists
- **Boulder Count**: 4
- **Display**: 1×4 grid (4 names, large font for spectators)

## Accessibility and Display Considerations

### For Spectators
- **Font Sizing**: Names should be readable from 20-30 feet away
- **Contrast**: High contrast (white on black) for visibility
- **Updates**: Real-time sync across multiple displays
- **Fullscreen**: Projector-friendly fullscreen mode

### For Officials/Judges
- **Control Panel**: Easy access to timer controls
- **Climber Management**: Quick import of competition rosters
- **Flexibility**: Ability to advance climbers individually or in groups

## Integration with Competition Software

While this timer is standalone, it could potentially integrate with:

- **USA Climbing Digital Scorecard**: Official scoring system
- **Vertical Life**: Competition management platform
- **Custom Spreadsheets**: Manual integration via CSV import

### Current CSV Import Format

The timer accepts simple text format:
```
Climber Name 1
Climber Name 2
Climber Name 3
```

For integration with competition software, export the start list in this format.

## Best Practices

### Before Competition
1. Import all categories and climber lists
2. Test audio on venue sound system
3. Verify fullscreen display on projector
4. Check multi-device sync if using multiple tablets/screens

### During Competition
1. Keep timer device connected to power
2. Have backup device ready with same categories loaded
3. Coordinate with MC/announcer on timing
4. Advance climbers promptly during transitions

### After Each Round
1. Note any timing irregularities
2. Reset for next round if needed
3. Update climber lists for finals if applicable

## Common Timing Scenarios

### Injury or Equipment Failure
- Pause timer if needed
- Reset to appropriate time
- Communicate with head judge

### Late Climber
- Individual category advancement may be needed
- Use per-boulder "Next B1/B2/B3/B4" buttons

### Technical Issues
- Server maintains timer state
- Reload page if client disconnects
- All connected devices will re-sync automatically

## Future Enhancements

Based on USA Climbing standards, potential improvements could include:

1. **Observation Timer**: 2-minute observation period before climbing
2. **Heat Management**: Support for multiple heats per category
3. **Finals Mode**: Special 6-8 climber mode with enhanced display
4. **Score Integration**: Link with scoring systems
5. **Attempt Tracking**: Visual indicator for attempts at top/zone
6. **Category Colors**: Color-code categories for easier identification
7. **Backup/Export**: Save competition setups for future use

## Resources

- **USA Climbing**: https://usaclimbing.org/
- **Competition Calendar**: https://usaclimbing.org/events/
- **Rulebook Updates**: Check for annual rulebook updates (typically released September-October)
- **Judge Training**: https://usaclimbing.org/officials/

## Notes

This reference is based on common USA Climbing competition practices as of 2025. Specific competitions may have variations in format, timing, or categories. Always defer to the official competition rules and head judge's decisions.

For the most up-to-date official rules, consult the current USA Climbing Rulebook.
