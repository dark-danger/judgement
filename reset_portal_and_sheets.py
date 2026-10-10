import os
import json
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("reset_script")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

SCORES_FILE = os.path.join(DATA_DIR, "scores.json")
REG_FILE = os.path.join(DATA_DIR, "registration.json")
EVENTS_FILE = os.path.join(DATA_DIR, "events.json")

def reset_all():
    print("🧹 [1/4] Resetting scores.json...")
    with open(SCORES_FILE, "w", encoding="utf-8") as f:
        json.dump([], f, indent=2)
    print("  ✅ All marks & scores cleared (0 scores).")

    print("\n🧹 [2/4] Resetting registration.json (Schools & Attendance)...")
    from create_excel import schools_data
    records = []
    total_schools = len(schools_data)
    schools_per_desk = (total_schools + 5) // 6
    for idx, row in enumerate(schools_data, start=1):
        school_name = row[0]
        room_no = row[9] if row[9] else "TBD"
        desk_no = min(6, ((idx - 1) // schools_per_desk) + 1)
        
        events_list = []
        if row[1] == "YES" and row[2]:
            events_list.append({
                "category": "Group Dance",
                "event_id": "evt-group-dance",
                "tag_no": row[2],
                "status": "PENDING"
            })
        if row[3] == "YES" and row[4]:
            events_list.append({
                "category": "Group Song",
                "event_id": "evt-group-song",
                "tag_no": row[4],
                "status": "PENDING"
            })
        if row[5] == "YES" and row[6]:
            events_list.append({
                "category": "Declamation",
                "event_id": "evt-declamation",
                "tag_no": row[6],
                "status": "PENDING"
            })
        if row[7] == "YES" and row[8]:
            events_list.append({
                "category": "Science Exhibition",
                "event_id": "evt-science-exhibition",
                "tag_no": row[8],
                "status": "PENDING"
            })

        records.append({
            "id": f"sch-{idx:02d}",
            "seq_no": idx,
            "school_name": school_name,
            "desk_no": desk_no,
            "room_no": room_no,
            "is_arrived": False,
            "arrived_at": None,
            "contact_person": "",
            "contact_phone": "",
            "notes": "",
            "events": events_list
        })

    with open(REG_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
    print(f"  ✅ Reset attendance for {len(records)} schools to ABSENT/PENDING.")

    print("\n🧹 [3/4] Resetting events.json (Clearing completed tags & index)...")
    from seed_events import build_category_events
    events = build_category_events()
    with open(EVENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(events, f, indent=2)
    print(f"  ✅ Reset {len(events)} events (Group Dance, Group Song, Declamation, Science Exhibition).")

    print("\n⚡ [4/4] Syncing Clean Reset to Google Sheet via Webhook...")
    import dotenv
    dotenv.load_dotenv(os.path.join(BASE_DIR, ".env"))
    
    from sheets_service import SheetsService
    sheets_srv = SheetsService()
    
    # Sync all 4 category tabs
    for ev in events:
        print(f"  • Syncing clean tab: '{ev['name']}'...")
        success, msg = sheets_srv.auto_sync_event(ev["id"])
        print(f"    -> Result: {msg}")

    # Sync Final Result tab
    print("  • Syncing clean 'Final Result' tab...")
    f_success, f_msg = sheets_srv.sync_final_championship()
    print(f"    -> Result: {f_msg}")

    print("\n🎉 ALL BACKEND DATA & GOOGLE SHEET RESET SUCCESSFULLY!")

if __name__ == "__main__":
    reset_all()
