# ⚖️ JudgePulse - Real-time Judgement & Sequence Management System

A synchronized 3-role live event evaluation and queue management portal with two-way Google Sheets sync.

---

## 🌟 Architecture & The 3 Dedicated Portals

### 1. 👥 Judge Portal (`/judge/<eventId>`)
- **Judge Profile Lock**: When judges open the single shared link, they see all judges' names. Clicking their name locks the evaluation session to that judge. If they accidentally close or refresh the tab, their session is automatically remembered and restored.
- **Tag Number Display**: Prominently shows the **Current Team's Tag Number** (`TAG-101`, `TAG-102`, etc.) on stage.
- **Next Coming Team**: Previews the next Tag in the sequence queue with a **2-minute countdown timer notice** when the sequence coordinator calls the next team.
- **5 Evaluation Criteria (20 Marks Each = Total 100)**:
  1. *Innovation & Concept* (0 - 20)
  2. *Technical Execution* (0 - 20)
  3. *Design & Functionality* (0 - 20)
  4. *Presentation & Q/A* (0 - 20)
  5. *Feasibility & Impact* (0 - 20)
- Interactive quick score buttons (`0, 5, 10, 12, 15, 18, 20`), numeric input, and range sliders.
- **Submit Score**: Real-time score recording with audio chime and celebration feedback.

---

### 2. 🔄 Sequence Controller Portal (`/sequence/<eventId>`)
- **Live Sequence Queue**: Dedicated link for the stage coordinator / backstage manager.
- **Queue Manipulation (Uppar, Nicha, Aga, Picha)**:
  - **▲ Move Up** / **▼ Move Down**: Shift slot positions.
  - **⏮ Rush to Top (Aga)** / **⏭ Send to End (Picha)**: Fast queue jumps.
  - **🎯 Stage**: Immediately set that tag as live on stage across all judge screens.
  - **⏩ Call Next Team**: Automatically advances the queue and starts the 2-minute transition countdown for judges.
  - **➕ Add Tag on the spot**: Add emergency or walk-in tag numbers to the sequence.

---

### 3. 👑 Super Admin Dashboard (`/admin`)
- **Create Events**:
  - Event Name & Description.
  - Choose total judges (**2 to 10 judges**).
  - Enter custom judge names.
  - Enter/paste Tag Numbers list or import from Google Sheets.
  - Automatically generates the **2 shareable links** with 1-click Copy buttons.
- **Master Leaderboard & Judgement Matrix**:
  - Live table showing every judge's individual score for every tag number.
  - Automatically computes overall average scores out of 100 and live ranks.
- **Admin Score Manipulation / Override**:
  - Click on any judge's score to open the edit modal and adjust individual criteria marks if needed.
- **Google Sheets & CSV Export**:
  - Export full evaluation matrix to Google Sheets or download as CSV.

---

## 🚀 Running the Server

```bash
cd /Users/yash/Documents/WORKS/Registration
.venv/bin/python app.py
```

### Access URLs:
- **Landing Hub**: [http://127.0.0.1:5005/](http://127.0.0.1:5005/)
- **Super Admin**: [http://127.0.0.1:5005/admin](http://127.0.0.1:5005/admin)
- **Judge Portal (Demo Event)**: [http://127.0.0.1:5005/judge/evt-grand-finale-2026](http://127.0.0.1:5005/judge/evt-grand-finale-2026)
- **Sequence Controller (Demo Event)**: [http://127.0.0.1:5005/sequence/evt-grand-finale-2026](http://127.0.0.1:5005/sequence/evt-grand-finale-2026)
