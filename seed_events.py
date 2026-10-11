import json
import os
import sys
from datetime import datetime
from create_excel import schools_data

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
EVENTS_FILE = os.path.join(DATA_DIR, "events.json")

DEFAULT_CRITERIA = [
    {"id": "c1", "name": "Innovation & Concept", "max_marks": 10},
    {"id": "c2", "name": "Technical Execution", "max_marks": 10},
    {"id": "c3", "name": "Design & Functionality", "max_marks": 10},
    {"id": "c4", "name": "Presentation & Q/A", "max_marks": 10},
    {"id": "c5", "name": "Feasibility & Impact", "max_marks": 10}
]

GSHEET_URL = "https://docs.google.com/spreadsheets/d/1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk/edit?usp=sharing"
GSHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyr_3MfnGGtZp4qUKEJ1-afuVPpSrOeD0U6wZ2HLAP3QHwTflRLJ-34fhDQRL3SaA88BA/exec"

def create_judges(count=5):
    return [{"id": f"j{i}", "name": f"Judge {i}", "is_active": True} for i in range(1, count + 1)]

def build_category_events():
    # Dynamic sequence rule: Performance sequences start EMPTY and are populated
    # dynamically ONLY as schools are approved (marked PRESENT) at the Registration Desk!
    dance_seq = []
    song_seq = []
    dec_seq = []
    sci_seq = []

    # If registration records already exist with PRESENT status, populate them
    try:
        from database import DATA_DIR, load_json
        reg_file = os.path.join(DATA_DIR, "registration.json")
        reg_data = load_json(reg_file, [])
        for s in reg_data:
            school_name = s.get("school_name", "")
            room = f" [Room: {s.get('room_no')}]" if s.get("room_no") else ""
            for ev in s.get("events", []):
                if ev.get("status") == "PRESENT" and ev.get("tag_no"):
                    item = {
                        "tag_no": ev["tag_no"],
                        "notes": f"{school_name}{room}",
                        "school_name": school_name,
                        "room_no": s.get("room_no", "TBD"),
                        "approved_at": ev.get("marked_at") or s.get("arrived_at")
                    }
                    if ev.get("category") == "Group Dance":
                        dance_seq.append(item)
                    elif ev.get("category") == "Group Song":
                        song_seq.append(item)
                    elif ev.get("category") == "Declamation":
                        dec_seq.append(item)
                    elif ev.get("category") == "Science Exhibition":
                        sci_seq.append(item)
    except Exception:
        pass

    events = [
        {
            "id": "evt-group-dance",
            "name": "Group Dance",
            "description": f"Agrash 2026 - Inter-School Group Dance Championship ({len(dance_seq)} Teams)",
            "created_at": datetime.now().isoformat(),
            "judge_count": 5,
            "judges": create_judges(5),
            "duration": "4 to 6 minutes",
            "team_size": "8 to 20 participants",
            "warning_bell": "4 minutes",
            "final_bell": "6 minutes",
            "rules": [
                "Each team must comprise a minimum of 8 and a maximum of 20 participants.",
                "Performance duration: 4 to 6 minutes (Warning bell at 4 min, final bell at 6 min).",
                "Performing beyond 6 minutes will lead to disqualification.",
                "An additional 1 minute will be provided for setting up props, if required.",
                "Theme: Cultural, Religious, Social, or Patriotic.",
                "Pure dance performance only; enactments, skits, or drama will not be entertained.",
                "Permissible dance forms: Classical, Folk, Western (Freestyle, Hip Hop, Contemporary, etc.).",
                "Music tracks must be brought in MP3 format on a pen drive.",
                "Participants are not permitted to wear school uniforms during performance.",
                "Any form of vulgarity (audible or visual) will result in immediate disqualification."
            ],
            "themes": [
                "‘हर राज्य कुछ कहता है’ / ‘Unity in Diversity’ (Indian Folk)",
                "‘Around the World’ (Dance representing cultures of other countries)",
                "Women Empowerment"
            ],
            "criteria": [
                {
                    "id": "c1",
                    "name": "Dance Steps & Coordination",
                    "max_marks": 10,
                    "description": "Accuracy of steps, rhythm and synchronization"
                },
                {
                    "id": "c2",
                    "name": "Expressions",
                    "max_marks": 10,
                    "description": "Facial expressions and emotional connection"
                },
                {
                    "id": "c3",
                    "name": "Creativity",
                    "max_marks": 10,
                    "description": "Originality and presentation of the performance"
                },
                {
                    "id": "c4",
                    "name": "Stage Presence & Confidence",
                    "max_marks": 10,
                    "description": "Confidence, energy and audience engagement"
                },
                {
                    "id": "c5",
                    "name": "Overall Performance",
                    "max_marks": 10,
                    "description": "Overall impact and quality of the performance"
                }
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
            "description": f"Agrash 2026 (12 October 2026) - Group Song & Choir Competition ({len(song_seq)} Teams)",
            "created_at": datetime.now().isoformat(),
            "judge_count": 5,
            "judges": create_judges(5),
            "duration": "4 to 6 minutes",
            "team_size": "6 to 12 participants",
            "warning_bell": "4 minutes",
            "final_bell": "6 minutes",
            "rules": [
                "Each team must comprise a minimum of 6 and a maximum of 12 participants.",
                "Performance duration: 4 to 6 minutes (Warning bell at 4 min, final bell at 6 min).",
                "Performing beyond 6 minutes will lead to disqualification.",
                "An additional 1 minute will be provided for setting up instruments.",
                "A maximum of five (5) musical instruments is permitted.",
                "Only two teachers may assist with instruments; all remaining instruments must be played by students.",
                "Song may belong to Classical, Folk, or Western genre.",
                "Theme: Cultural, Religious, Social, or Patriotic.",
                "Participants are not permitted to wear school uniforms during performance.",
                "Any form of vulgarity will result in immediate disqualification."
            ],
            "themes": [
                "‘Peace through Melody’: Patriotic Theme",
                "Classical Music",
                "Harmony in Diversity: Music representing cultures"
            ],
            "criteria": [
                {
                    "id": "c1",
                    "name": "Vocal Quality & Control",
                    "max_marks": 10,
                    "description": "Pitch accuracy, tone, clarity, breath control and vocal stability."
                },
                {
                    "id": "c2",
                    "name": "Rhythm & Timing",
                    "max_marks": 10,
                    "description": "Keeping the beat, tempo and timing with the music."
                },
                {
                    "id": "c3",
                    "name": "Expression & Emotion",
                    "max_marks": 10,
                    "description": "Emotional connection, phrasing and conveying the song's mood."
                },
                {
                    "id": "c4",
                    "name": "Stage Presence & Confidence",
                    "max_marks": 10,
                    "description": "Confidence, posture, composure and audience engagement."
                },
                {
                    "id": "c5",
                    "name": "Musicality & Originality",
                    "max_marks": 10,
                    "description": "Interpretation, creativity, style and overall musical impact."
                }
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
            "description": f"Agrash 2026 (12 October 2026) - Declamation & Oratory Contest ({len(dec_seq)} Teams)",
            "created_at": datetime.now().isoformat(),
            "judge_count": 5,
            "judges": create_judges(5),
            "duration": "3 minutes",
            "team_size": "Maximum 2 participants per school",
            "warning_bell": "2 minutes",
            "final_bell": "3 minutes",
            "rules": [
                "Each school may nominate a maximum of two (2) participants.",
                "Participants must speak on different topics selected from the official list.",
                "Speech duration: exactly 3 minutes.",
                "A warning bell will ring at 2 minutes, and a final bell at 3 minutes.",
                "Speaking beyond 3 minutes will lead to disqualification.",
                "Language of delivery may be English or Hindi.",
                "Brochure Evaluation parameters: Content, Pronunciation, Accent, Gestures, and Overall Presentation.",
                "The decision of the judges shall be final and binding on all participants."
            ],
            "themes": [
                "Leadership Lessons from the Bhagavad Gita (भगवद गीता से नेतृत्व के पाठ)",
                "Duty and Responsibility: Teachings of the Bhagavad Gita (कर्तव्य और जिम्मेदारी: भगवद गीता की शिक्षाएँ)",
                "Detachment and Inner Peace: Lessons from the Gita (वैराग्य और आत्मिक शांति: गीता से सीख)",
                "Bhagavad Gita and Moral Decision Making (नैतिक निर्णय लेने में भगवद गीता का मार्गदर्शन)",
                "Bhagavad Gita: A Guide to Overcoming Challenges (संकटों से निपटने में भगवद गीता मार्गदर्शक है)",
                "Stress Management and Gita (तनाव प्रबंधन एवं गीता)",
                "Gita is the path to World Peace (गीता विश्व शांति का मार्ग है)"
            ],
            "criteria": [
                {
                    "id": "c1",
                    "name": "Content & Message",
                    "max_marks": 10,
                    "description": "Meaningful, appropriate speech; clear central theme; strong opening and closing; suitability to age group."
                },
                {
                    "id": "c2",
                    "name": "Delivery & Voice",
                    "max_marks": 10,
                    "description": "Clear pronunciation; modulation of pitch and volume; pace; pauses for effect; confident tone."
                },
                {
                    "id": "c3",
                    "name": "Expression & Emotion",
                    "max_marks": 10,
                    "description": "Emotion matching the content; facial expressions; passion and conviction; ability to move the audience."
                },
                {
                    "id": "c4",
                    "name": "Body Language & Stage Presence",
                    "max_marks": 10,
                    "description": "Posture; eye contact; purposeful gestures; confidence; stage movement; avoiding nervous habits."
                },
                {
                    "id": "c5",
                    "name": "Memorization & Fluency",
                    "max_marks": 10,
                    "description": "Delivery without prompting; no hesitation or fumbling; smooth recovery from slips."
                },
                {
                    "id": "c6",
                    "name": "Overall Impact",
                    "max_marks": 10,
                    "description": "Audience engagement; originality in interpretation; memorable performance."
                }
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
            "description": f"Agrash 2026 (12 October 2026) - Science Exhibition & Working Models ({len(sci_seq)} Teams)",
            "created_at": datetime.now().isoformat(),
            "judge_count": 5,
            "judges": create_judges(5),
            "duration": "4 to 6 minutes",
            "team_size": "2 to 4 students per team",
            "warning_bell": "4 minutes",
            "final_bell": "6 minutes",
            "rules": [
                "All students from Science stream enrolled in Class 9 and above are eligible.",
                "Each team may consist of 2 to 4 students, and only one team per school is allowed.",
                "Each team will be given 4 to 6 minutes to present their project.",
                "A warning bell will ring at 4 minutes, and a final bell at 6 minutes.",
                "Presenting beyond 6 minutes will lead to disqualification.",
                "ONLY WORKING MODELS will be accepted for the exhibition.",
                "Disciplines: Biology, Chemistry, Computer Science, Mathematics, and Physics.",
                "Brochure Evaluation parameters: Conceptual Clarity, Explanation, and Relevance.",
                "The decision of the judges shall be final and binding."
            ],
            "themes": [
                "Innovating for a Sustainable Future: Science for achieving the SDGs",
                "Sub-Theme: Green Energy - Zero Emissions & Renewable Tomorrow",
                "Sub-Theme: Disaster-Resistant - Protecting Lives",
                "Sub-Theme: Pollution Control & Remediation",
                "Sub-Theme: Healthcare Innovation",
                "Sub-Theme: Agri-Tech & Smart Farming"
            ],
            "criteria": [
                {
                    "id": "c1",
                    "name": "Scientific Knowledge and Accuracy",
                    "max_marks": 10,
                    "description": "Understanding of scientific concepts and accuracy of facts."
                },
                {
                    "id": "c2",
                    "name": "Creativity and Innovation",
                    "max_marks": 10,
                    "description": "Originality of the idea and creative use of materials."
                },
                {
                    "id": "c3",
                    "name": "Working Model and Practical Application",
                    "max_marks": 10,
                    "description": "Functionality, demonstration, and real-life applicability of the project."
                },
                {
                    "id": "c4",
                    "name": "Presentation and Communication",
                    "max_marks": 10,
                    "description": "Clarity, confidence, and effective explanation of the project."
                },
                {
                    "id": "c5",
                    "name": "Question - Answer Session",
                    "max_marks": 10,
                    "description": "Ability to answer questions and explain the scientific principles involved."
                }
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

