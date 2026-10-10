import os
import json
import logging
from datetime import datetime
from create_excel import schools_data
from database import DATA_DIR, load_json, save_json

logger = logging.getLogger("registration_service")

REG_FILE = os.path.join(DATA_DIR, "registration.json")

def init_registration_data():
    """Builds initial 58 schools registration records divided into 6 desks"""
    existing = load_json(REG_FILE, [])
    records = []
    total_schools = len(schools_data)
    schools_per_desk = (total_schools + 5) // 6 # ~10 schools per desk (10, 10, 10, 10, 10, 8)

    if existing and len(existing) >= 58:
        # Re-assign desk_no for 6 desks
        for idx, s in enumerate(existing, start=1):
            desk_no = min(6, ((idx - 1) // schools_per_desk) + 1)
            s["desk_no"] = desk_no
        save_json(REG_FILE, existing)
        return existing

    for idx, row in enumerate(schools_data, start=1):
        school_name = row[0]
        room_no = row[9] if row[9] else "TBD"
        
        # Calculate Desk 1 to 6
        desk_no = min(6, ((idx - 1) // schools_per_desk) + 1)
        
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

    save_json(REG_FILE, records)
    logger.info(f"✅ Initialized {len(records)} school registration records across 6 desks.")
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
            # Trigger background sheet sync for the main category sheets directly
            try:
                from sheets_service import sheets_service
                if mark_all:
                    sheets_service.trigger_background_sync(None)
                else:
                    cat_event_map = {
                        "group dance": "evt-group-dance",
                        "group song": "evt-group-song",
                        "declamation": "evt-declamation",
                        "science exhibition": "evt-science-exhibition"
                    }
                    ev_id = cat_event_map.get(category.lower() if category else "", None)
                    sheets_service.trigger_background_sync(ev_id)
            except Exception as e:
                logger.error(f"Error triggering sheet sync on attendance: {e}")

        return updated_school

    def get_stats(self):
        data = self._load()
        total_schools = len(data)
        arrived_schools = sum(1 for s in data if s.get("is_arrived"))
        
        # Desks stats
        desk_stats = {}
        for d in range(1, 7):
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

    def upsert_school(self, school_name, dance_tag="", song_tag="", declamation_tag="", science_tag="", room_no="TBD", desk_no=None):
        data = self._load()
        school_name = school_name.strip()
        if not school_name:
            return None

        # Check if already exists
        matched = None
        for s in data:
            if s["school_name"].strip().lower() == school_name.lower():
                matched = s
                break

        events_list = []
        if dance_tag:
            events_list.append({"category": "Group Dance", "event_id": "evt-group-dance", "tag_no": dance_tag.strip(), "status": "PENDING"})
        if song_tag:
            events_list.append({"category": "Group Song", "event_id": "evt-group-song", "tag_no": song_tag.strip(), "status": "PENDING"})
        if declamation_tag:
            events_list.append({"category": "Declamation", "event_id": "evt-declamation", "tag_no": declamation_tag.strip(), "status": "PENDING"})
        if science_tag:
            events_list.append({"category": "Science Exhibition", "event_id": "evt-science-exhibition", "tag_no": science_tag.strip(), "status": "PENDING"})

        if matched:
            for ev in events_list:
                for old_ev in matched.get("events", []):
                    if old_ev.get("category") == ev["category"]:
                        ev["status"] = old_ev.get("status", "PENDING")
                        ev["marked_at"] = old_ev.get("marked_at")
            matched["events"] = events_list
            if room_no and room_no != "TBD":
                matched["room_no"] = room_no
            if desk_no:
                matched["desk_no"] = desk_no
            self._save(data)
            return matched
        else:
            new_idx = len(data) + 1
            calculated_desk = desk_no or (((new_idx - 1) % 6) + 1)
            new_school = {
                "id": f"sch-{new_idx:02d}",
                "seq_no": new_idx,
                "school_name": school_name,
                "desk_no": calculated_desk,
                "room_no": room_no or "TBD",
                "is_arrived": False,
                "arrived_at": None,
                "contact_person": "",
                "contact_phone": "",
                "notes": "",
                "events": events_list
            }
            data.append(new_school)
            self._save(data)

            # Add to event sequence queues if not present
            try:
                from database import db
                for ev in events_list:
                    event = db.get_event(ev["event_id"])
                    if event:
                        seq = list(event.get("sequence", []))
                        existing_tags = [item["tag_no"] for item in seq] + [item["tag_no"] for item in event.get("completed_tags", [])]
                        if ev["tag_no"] not in existing_tags:
                            seq.append({
                                "tag_no": ev["tag_no"],
                                "notes": f"{school_name} [Room: {room_no}]"
                            })
                            db.update_sequence(ev["event_id"], seq)
            except Exception as e:
                logger.error(f"Error adding tag to sequence queue: {e}")

            return new_school

    def _load(self):
        data = load_json(REG_FILE, [])
        if not data or len(data) < 58:
            return init_registration_data()
        return data

    def _save(self, data):
        save_json(REG_FILE, data)

registration_service = RegistrationService()

