import json
import os
from datetime import datetime
from create_excel import schools_data

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
EVENTS_FILE = os.path.join(DATA_DIR, "events.json")

DEFAULT_CRITERIA = [
    {"id": "c1", "name": "Innovation & Concept", "max_marks": 20},
    {"id": "c2", "name": "Technical Execution", "max_marks": 20},
    {"id": "c3", "name": "Design & Functionality", "max_marks": 20},
    {"id": "c4", "name": "Presentation & Q/A", "max_marks": 20},
    {"id": "c5", "name": "Feasibility & Impact", "max_marks": 20}
]

GSHEET_URL = "https://docs.google.com/spreadsheets/d/1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk/edit?usp=sharing"
GSHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyr_3MfnGGtZp4qUKEJ1-afuVPpSrOeD0U6wZ2HLAP3QHwTflRLJ-34fhDQRL3SaA88BA/exec"

def create_judges(count=5):
    return [{"id": f"j{i}", "name": f"Judge {i}", "is_active": True} for i in range(1, count + 1)]

def build_category_events():
    dance_seq = []
    song_seq = []
    dec_seq = []
    sci_seq = []

    for row in schools_data:
        school_name = row[0]
        room = f" [Room: {row[9]}]" if row[9] else ""
        
        # Group Dance
        if row[1] == "YES" and row[2]:
            dance_seq.append({"tag_no": row[2], "notes": f"{school_name}{room}"})
            
        # Group Song
        if row[3] == "YES" and row[4]:
            song_seq.append({"tag_no": row[4], "notes": f"{school_name}{room}"})
            
        # Declamation
        if row[5] == "YES" and row[6]:
            dec_seq.append({"tag_no": row[6], "notes": f"{school_name}{room}"})
            
        # Science Exhibition
        if row[7] == "YES" and row[8]:
            sci_seq.append({"tag_no": row[8], "notes": f"{school_name}{room}"})

    events = [
        {
            "id": "evt-group-dance",
            "name": "Group Dance",
            "description": f"Agrash 2026 - Group Dance Competition ({len(dance_seq)} Teams)",
            "created_at": datetime.now().isoformat(),
            "judge_count": 5,
            "judges": create_judges(5),
            "criteria": [
                {"id": "c1", "name": "Choreography & Formation", "max_marks": 20},
                {"id": "c2", "name": "Rhythm & Synchronization", "max_marks": 20},
                {"id": "c3", "name": "Costume & Expression", "max_marks": 20},
                {"id": "c4", "name": "Energy & Stage Presence", "max_marks": 20},
                {"id": "c5", "name": "Overall Impact", "max_marks": 20}
            ],
            "sequence": dance_seq,
            "completed_tags": [],
            "current_index": 0,
            "next_transition_time": None,
            "transition_seconds": 120,
            "google_sheet_url": GSHEET_URL,
            "google_sheet_webhook_url": GSHEET_WEBHOOK_URL
        },
        {
            "id": "evt-group-song",
            "name": "Group Song",
            "description": f"Agrash 2026 - Group Song & Choir Competition ({len(song_seq)} Teams)",
            "created_at": datetime.now().isoformat(),
            "judge_count": 5,
            "judges": create_judges(5),
            "criteria": [
                {"id": "c1", "name": "Sur & Vocal Pitch", "max_marks": 20},
                {"id": "c2", "name": "Taal & Rhythm Harmony", "max_marks": 20},
                {"id": "c3", "name": "Pronunciation & Clarity", "max_marks": 20},
                {"id": "c4", "name": "Synchronization & Blend", "max_marks": 20},
                {"id": "c5", "name": "Overall Melodic Impact", "max_marks": 20}
            ],
            "sequence": song_seq,
            "completed_tags": [],
            "current_index": 0,
            "next_transition_time": None,
            "transition_seconds": 120,
            "google_sheet_url": GSHEET_URL,
            "google_sheet_webhook_url": GSHEET_WEBHOOK_URL
        },
        {
            "id": "evt-declamation",
            "name": "Declamation",
            "description": f"Agrash 2026 - Declamation & Speech Competition ({len(dec_seq)} Teams)",
            "created_at": datetime.now().isoformat(),
            "judge_count": 5,
            "judges": create_judges(5),
            "criteria": [
                {"id": "c1", "name": "Content & Originality", "max_marks": 20},
                {"id": "c2", "name": "Fluency & Diction", "max_marks": 20},
                {"id": "c3", "name": "Voice Modulation & Tone", "max_marks": 20},
                {"id": "c4", "name": "Confidence & Body Language", "max_marks": 20},
                {"id": "c5", "name": "Adherence to Time Limit", "max_marks": 20}
            ],
            "sequence": dec_seq,
            "completed_tags": [],
            "current_index": 0,
            "next_transition_time": None,
            "transition_seconds": 120,
            "google_sheet_url": GSHEET_URL,
            "google_sheet_webhook_url": GSHEET_WEBHOOK_URL
        },
        {
            "id": "evt-science-exhibition",
            "name": "Science Exhibition",
            "description": f"Agrash 2026 - Science Exhibition & Working Models ({len(sci_seq)} Teams)",
            "created_at": datetime.now().isoformat(),
            "judge_count": 5,
            "judges": create_judges(5),
            "criteria": [
                {"id": "c1", "name": "Scientific Principle & Concept", "max_marks": 20},
                {"id": "c2", "name": "Working Model Execution", "max_marks": 20},
                {"id": "c3", "name": "Creativity & Innovation", "max_marks": 20},
                {"id": "c4", "name": "Student Presentation & Q/A", "max_marks": 20},
                {"id": "c5", "name": "Utility & Societal Impact", "max_marks": 20}
            ],
            "sequence": sci_seq,
            "completed_tags": [],
            "current_index": 0,
            "next_transition_time": None,
            "transition_seconds": 120,
            "google_sheet_url": GSHEET_URL,
            "google_sheet_webhook_url": GSHEET_WEBHOOK_URL
        }
    ]
    return events

def seed():
    events = build_category_events()
    with open(EVENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(events, f, indent=2)
    print(f"✅ Successfully seeded {len(events)} category events into {EVENTS_FILE}")
    for ev in events:
        print(f"  • [{ev['id']}] {ev['name']}: {len(ev['sequence'])} participants")

if __name__ == "__main__":
    seed()
