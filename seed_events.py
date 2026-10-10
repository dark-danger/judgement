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
                    "name": "Choreography, Formations & Creativity",
                    "max_marks": 20,
                    "description": "Originality of routine, complex step patterns, spatial coverage, and smooth group transitions."
                },
                {
                    "id": "c2",
                    "name": "Rhythm, Timing & Group Synchronization",
                    "max_marks": 20,
                    "description": "Precision of footwork, rhythm matching musical beats/tempo, and unison across all dancers."
                },
                {
                    "id": "c3",
                    "name": "Expressions (Bhava/Abhinaya), Costume & Props",
                    "max_marks": 20,
                    "description": "Facial expressions, emotive acting, authentic costume aesthetics, and effective use of allowable props."
                },
                {
                    "id": "c4",
                    "name": "Energy, Technique & Stage Presence",
                    "max_marks": 20,
                    "description": "Stamina, body posture, agility, flexibility, confidence, and commanding stage dynamics."
                },
                {
                    "id": "c5",
                    "name": "Thematic Execution, Time Adherence & Pure Dance Compliance",
                    "max_marks": 20,
                    "description": "Relevance to chosen theme, compliance with the 4-6 min duration, and pure dance format (no drama/skits)."
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
            "description": f"Agrash 2026 - Group Song & Choir Competition ({len(song_seq)} Teams)",
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
                    "name": "Sur, Vocal Pitch & Melodic Accuracy",
                    "max_marks": 20,
                    "description": "Pitch precision, tonal quality, vocal purity, pitch control, and melodic consistency."
                },
                {
                    "id": "c2",
                    "name": "Taal, Rhythm & Instrumental Synchronization",
                    "max_marks": 20,
                    "description": "Beat consistency (Taal), tempo stability, and harmony between instruments and vocalists."
                },
                {
                    "id": "c3",
                    "name": "Choral Harmony, Blend & Synchronization",
                    "max_marks": 20,
                    "description": "Vocal balance between lead and chorus, multi-part harmony, unison delivery, and coordination."
                },
                {
                    "id": "c4",
                    "name": "Pronunciation, Diction & Theme Expression",
                    "max_marks": 20,
                    "description": "Clarity of lyrical enunciation, emotional depth (Bhava), and theme fidelity."
                },
                {
                    "id": "c5",
                    "name": "Stage Presence, Overall Melodic Impact & Time Adherence",
                    "max_marks": 20,
                    "description": "Artistic presentation, choir discipline, audience impact, and strict adherence to 4-6 min duration."
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
            "description": f"Agrash 2026 - Declamation & Oratory Contest ({len(dec_seq)} Teams)",
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
                    "name": "Content, Originality & Subject Depth",
                    "max_marks": 20,
                    "description": "Depth of thoughts, insight into Bhagavad Gita teachings, logical structure, and originality."
                },
                {
                    "id": "c2",
                    "name": "Pronunciation & Diction",
                    "max_marks": 20,
                    "description": "Clarity of articulation, correct enunciation in Hindi/English, and linguistic purity."
                },
                {
                    "id": "c3",
                    "name": "Accent, Voice Modulation & Tone",
                    "max_marks": 20,
                    "description": "Pitch variation, tonal inflection, tempo control, expressiveness, and vocal power."
                },
                {
                    "id": "c4",
                    "name": "Gestures, Body Language & Eye Contact",
                    "max_marks": 20,
                    "description": "Authoritative stage posture, natural and expressive gestures, eye contact, and poise."
                },
                {
                    "id": "c5",
                    "name": "Overall Presentation, Impact & Time Adherence",
                    "max_marks": 20,
                    "description": "Persuasive oratorical appeal, audience engagement, confidence, and adherence to 3 min limit."
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
            "description": f"Agrash 2026 - Science Exhibition & Working Models ({len(sci_seq)} Teams)",
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
                    "name": "Conceptual Clarity & Scientific Principle",
                    "max_marks": 20,
                    "description": "Soundness of scientific principles, technical depth, accuracy, and scientific rigor."
                },
                {
                    "id": "c2",
                    "name": "Working Model Execution & Innovation",
                    "max_marks": 20,
                    "description": "Working functionality of model, operational reliability, ingenuity, and problem-solving design."
                },
                {
                    "id": "c3",
                    "name": "Explanation, Clarity & Student Presentation",
                    "max_marks": 20,
                    "description": "Communication clarity, structured demonstration, articulation, and balanced team participation."
                },
                {
                    "id": "c4",
                    "name": "Relevance to Theme & SDG Alignment",
                    "max_marks": 20,
                    "description": "Direct alignment with SDGs (Green Energy, Disaster-Resilience, Healthcare, Agri-tech, Pollution)."
                },
                {
                    "id": "c5",
                    "name": "Practical Utility, Societal Impact & Q/A Handling",
                    "max_marks": 20,
                    "description": "Real-world scalability, economic viability, societal benefit, and confident Q&A responses."
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

