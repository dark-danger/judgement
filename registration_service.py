import os
import json
import logging
from datetime import datetime
from create_excel import schools_data

logger = logging.getLogger("registration_service")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
REG_FILE = os.path.join(DATA_DIR, "registration.json")

def init_registration_data():
    """Builds initial 58 schools registration records divided into 5 desks"""
    if os.path.exists(REG_FILE):
        try:
            with open(REG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data and len(data) >= 58:
                    return data
        except Exception:
            pass

    records = []
    total_schools = len(schools_data)
    schools_per_desk = (total_schools + 4) // 5 # ~12 schools per desk

    for idx, row in enumerate(schools_data, start=1):
        school_name = row[0]
        room_no = row[9] if row[9] else "TBD"
        
        # Calculate Desk 1 to 5
        desk_no = min(5, ((idx - 1) // schools_per_desk) + 1)
        
        events_list = []
        # Dance
        if row[1] == "YES" and row[2]:
            events_list.append({
                "category": "Group Dance",
                "event_id": "evt-group-dance",
                "tag_no": row[2],
                "status": "PENDING"
            })
        # Song
        if row[3] == "YES" and row[4]:
            events_list.append({
                "category": "Group Song",
                "event_id": "evt-group-song",
                "tag_no": row[4],
                "status": "PENDING"
            })
        # Declamation
        if row[5] == "YES" and row[6]:
            events_list.append({
                "category": "Declamation",
                "event_id": "evt-declamation",
                "tag_no": row[6],
                "status": "PENDING"
            })
        # Science Exhibition
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

    logger.info(f"✅ Initialized {len(records)} school registration records across 5 desks.")
    return records

class RegistrationService:
    def __init__(self):
        self.records = init_registration_data()

    def get_all(self, desk_no=None, query=""):
        data = self._load()
        if desk_no:
            try:
                d_num = int(desk_no)
                data = [s for s in data if s.get("desk_no") == d_num]
            except Exception:
                pass

        if query:
            q = query.strip().lower()
            filtered = []
            for s in data:
                if q in s["school_name"].lower() or q in s.get("room_no", "").lower():
                    filtered.append(s)
                elif any(q in ev.get("tag_no", "").lower() for ev in s.get("events", [])):
                    filtered.append(s)
            data = filtered

        return data

    def get_school(self, school_id):
        data = self._load()
        for s in data:
            if s["id"] == school_id or s["school_name"] == school_id:
                return s
        return None

    def mark_attendance(self, school_id, category=None, tag_no=None, status="PRESENT", mark_all=False):
        data = self._load()
        updated_school = None

        for s in data:
            if s["id"] == school_id or s["school_name"] == school_id:
                now_str = datetime.now().strftime("%I:%M %p")
                
                if mark_all:
                    for ev in s.get("events", []):
                        ev["status"] = status
                        ev["marked_at"] = now_str
                    s["is_arrived"] = (status == "PRESENT")
                    if status == "PRESENT" and not s.get("arrived_at"):
                        s["arrived_at"] = now_str
                else:
                    for ev in s.get("events", []):
                        if (category and ev["category"].lower() == category.lower()) or (tag_no and ev["tag_no"] == tag_no):
                            ev["status"] = status
                            ev["marked_at"] = now_str
                    
                    # Update overall arrival if at least 1 event is present
                    has_present = any(ev.get("status") == "PRESENT" for ev in s.get("events", []))
                    s["is_arrived"] = has_present
                    if has_present and not s.get("arrived_at"):
                        s["arrived_at"] = now_str

                updated_school = s
                break

        if updated_school:
            self._save(data)
            # Trigger background sheet sync
            try:
                from sheets_service import sheets_service
                sheets_service.trigger_master_registration_sync()
            except Exception as e:
                logger.error(f"Error triggering sheet sync on attendance: {e}")

        return updated_school

    def get_stats(self):
        data = self._load()
        total_schools = len(data)
        arrived_schools = sum(1 for s in data if s.get("is_arrived"))
        
        # Desks stats
        desk_stats = {}
        for d in range(1, 6):
            d_schools = [s for s in data if s.get("desk_no") == d]
            desk_stats[f"Desk {d}"] = {
                "total": len(d_schools),
                "arrived": sum(1 for s in d_schools if s.get("is_arrived"))
            }

        # Categories stats
        cat_stats = {
            "Group Dance": {"total": 0, "present": 0},
            "Group Song": {"total": 0, "present": 0},
            "Declamation": {"total": 0, "present": 0},
            "Science Exhibition": {"total": 0, "present": 0}
        }
        for s in data:
            for ev in s.get("events", []):
                cat = ev.get("category")
                if cat in cat_stats:
                    cat_stats[cat]["total"] += 1
                    if ev.get("status") == "PRESENT":
                        cat_stats[cat]["present"] += 1

        return {
            "total_schools": total_schools,
            "arrived_schools": arrived_schools,
            "arrived_percentage": round((arrived_schools / total_schools) * 100, 1) if total_schools else 0,
            "desks": desk_stats,
            "categories": cat_stats
        }

    def _load(self):
        if not os.path.exists(REG_FILE):
            return init_registration_data()
        try:
            with open(REG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return init_registration_data()

    def _save(self, data):
        with open(REG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

registration_service = RegistrationService()
