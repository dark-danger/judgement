import os
import json
import uuid
import time
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

EVENTS_FILE = os.path.join(DATA_DIR, "events.json")
SCORES_FILE = os.path.join(DATA_DIR, "scores.json")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")

DEFAULT_CRITERIA = [
    {"id": "c1", "name": "Innovation & Concept", "max_marks": 20},
    {"id": "c2", "name": "Technical Execution", "max_marks": 20},
    {"id": "c3", "name": "Design & Functionality", "max_marks": 20},
    {"id": "c4", "name": "Presentation & Q/A", "max_marks": 20},
    {"id": "c5", "name": "Feasibility & Impact", "max_marks": 20}
]

def load_json(filepath, default):
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default
    return default

def save_json(filepath, data):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

class DB:
    def __init__(self):
        self._init_defaults()

    def _init_defaults(self):
        events = load_json(EVENTS_FILE, [])
        # Always ensure Agrash is the primary active event
        agrash_event = {
            "id": "evt-agrash",
            "name": "Agrash",
            "description": "Agrash Grand Finale - Live Judgement & Stage Evaluation",
            "created_at": datetime.now().isoformat(),
            "judge_count": 5,
            "judges": [
                {"id": "j1", "name": "Judge 1", "is_active": True},
                {"id": "j2", "name": "Judge 2", "is_active": True},
                {"id": "j3", "name": "Judge 3", "is_active": True},
                {"id": "j4", "name": "Judge 4", "is_active": True},
                {"id": "j5", "name": "Judge 5", "is_active": True}
            ],
            "criteria": DEFAULT_CRITERIA,
            "sequence": [
                {"tag_no": "TAG-101", "notes": "Slot 1"},
                {"tag_no": "TAG-102", "notes": "Slot 2"},
                {"tag_no": "TAG-103", "notes": "Slot 3"},
                {"tag_no": "TAG-104", "notes": "Slot 4"},
                {"tag_no": "TAG-105", "notes": "Slot 5"},
                {"tag_no": "TAG-106", "notes": "Slot 6"},
                {"tag_no": "TAG-107", "notes": "Slot 7"},
                {"tag_no": "TAG-108", "notes": "Slot 8"},
                {"tag_no": "TAG-109", "notes": "Slot 9"},
                {"tag_no": "TAG-110", "notes": "Slot 10"}
            ],
            "completed_tags": [],
            "current_index": 0,
            "next_transition_time": None,
            "transition_seconds": 120,
            "google_sheet_url": ""
        }
        if not any(e.get("id") == "evt-agrash" for e in events):
            events.insert(0, agrash_event)
            save_json(EVENTS_FILE, events)

    def get_events(self):
        return load_json(EVENTS_FILE, [])

    def get_event(self, event_id):
        events = self.get_events()
        for e in events:
            if e["id"] == event_id:
                return e
        if events:
            return events[0]
        return None

    def create_event(self, name, description, judge_names, tag_numbers, criteria=None, google_sheet_url=""):
        events = self.get_events()
        event_id = f"evt-{uuid.uuid4().hex[:8]}"

        judges_list = []
        for idx, jname in enumerate(judge_names, start=1):
            judges_list.append({
                "id": f"j{idx}",
                "name": jname.strip() if jname.strip() else f"Judge {idx}",
                "is_active": True
            })

        seq_list = []
        for tag in tag_numbers:
            t = tag.strip()
            if t:
                seq_list.append({"tag_no": t, "notes": ""})

        new_event = {
            "id": event_id,
            "name": name.strip(),
            "description": description.strip(),
            "created_at": datetime.now().isoformat(),
            "judge_count": len(judges_list),
            "judges": judges_list,
            "criteria": criteria or DEFAULT_CRITERIA,
            "sequence": seq_list,
            "completed_tags": [],
            "current_index": 0,
            "next_transition_time": None,
            "transition_seconds": 120,
            "google_sheet_url": google_sheet_url
        }
        events.insert(0, new_event)
        save_json(EVENTS_FILE, events)
        return new_event

    def update_event(self, event_id, update_dict):
        events = self.get_events()
        for i, e in enumerate(events):
            if e["id"] == event_id:
                events[i].update(update_dict)
                save_json(EVENTS_FILE, events)
                return events[i]
        return None

    def delete_event(self, event_id):
        events = self.get_events()
        events = [e for e in events if e["id"] != event_id]
        save_json(EVENTS_FILE, events)
        return True

    def update_sequence(self, event_id, new_sequence, current_index=None):
        event = self.get_event(event_id)
        if not event:
            return None
        event["sequence"] = new_sequence
        if current_index is not None:
            event["current_index"] = max(0, min(current_index, len(new_sequence) - 1)) if new_sequence else 0
        event["next_transition_time"] = time.time() + event.get("transition_seconds", 120)
        return self.update_event(event_id, event)

    def set_current_tag(self, event_id, target_index):
        event = self.get_event(event_id)
        if not event:
            return None
        if 0 <= target_index < len(event["sequence"]):
            event["current_index"] = target_index
            event["next_transition_time"] = time.time() + event.get("transition_seconds", 120)
            return self.update_event(event_id, event)
        return None

    def complete_and_remove_tag(self, event_id, tag_index=None, tag_no=None):
        """Marks a tag as completed, stores in completed_tags history, and removes from active sequence"""
        event = self.get_event(event_id)
        if not event or not event.get("sequence"):
            return None, "No active tags in sequence"

        seq = list(event["sequence"])
        completed_list = event.get("completed_tags", [])

        idx_to_remove = None
        if tag_index is not None and 0 <= tag_index < len(seq):
            idx_to_remove = tag_index
        elif tag_no:
            for i, item in enumerate(seq):
                if item["tag_no"] == tag_no:
                    idx_to_remove = i
                    break

        if idx_to_remove is None:
            idx_to_remove = event.get("current_index", 0)

        if 0 <= idx_to_remove < len(seq):
            removed_item = seq.pop(idx_to_remove)
            removed_item["completed_at"] = datetime.now().strftime("%I:%M %p")
            completed_list.append(removed_item)
            
            event["sequence"] = seq
            event["completed_tags"] = completed_list
            # Keep index at current or clamp
            event["current_index"] = max(0, min(idx_to_remove, len(seq) - 1)) if seq else 0
            event["next_transition_time"] = time.time() + event.get("transition_seconds", 120)

            updated = self.update_event(event_id, event)
            return updated, f"Tag '{removed_item['tag_no']}' completed and removed from queue"
        
        return None, "Could not find tag to complete"

    def restore_completed_tag(self, event_id, tag_no):
        """Restores a completed tag back to the active sequence queue"""
        event = self.get_event(event_id)
        if not event:
            return None
        
        completed_list = event.get("completed_tags", [])
        matched = None
        for i, c in enumerate(completed_list):
            if c["tag_no"] == tag_no:
                matched = completed_list.pop(i)
                break
        
        if matched:
            event["sequence"].append({"tag_no": matched["tag_no"], "notes": ""})
            event["completed_tags"] = completed_list
            return self.update_event(event_id, event)
        return None

    def get_scores(self, event_id=None, tag_no=None):
        scores = load_json(SCORES_FILE, [])
        if event_id:
            scores = [s for s in scores if s.get("event_id") == event_id]
        if tag_no:
            scores = [s for s in scores if s.get("tag_no") == tag_no]
        return scores

    def submit_score(self, event_id, tag_no, judge_id, judge_name, criteria_scores, remarks=""):
        scores = load_json(SCORES_FILE, [])
        total = sum(float(v) for v in criteria_scores.values() if v is not None and str(v).replace('.', '', 1).isdigit())

        existing_idx = None
        for i, s in enumerate(scores):
            if s.get("event_id") == event_id and s.get("tag_no") == tag_no and s.get("judge_id") == judge_id:
                existing_idx = i
                break

        score_entry = {
            "id": f"sc-{uuid.uuid4().hex[:8]}",
            "event_id": event_id,
            "tag_no": tag_no,
            "judge_id": judge_id,
            "judge_name": judge_name,
            "scores": criteria_scores,
            "total": round(total, 2),
            "remarks": remarks,
            "updated_at": datetime.now().isoformat()
        }

        if existing_idx is not None:
            score_entry["id"] = scores[existing_idx]["id"]
            scores[existing_idx] = score_entry
        else:
            scores.append(score_entry)

        save_json(SCORES_FILE, scores)
        return score_entry

    def admin_override_score(self, score_id, criteria_scores, remarks=""):
        scores = load_json(SCORES_FILE, [])
        total = sum(float(v) for v in criteria_scores.values() if v is not None and str(v).replace('.', '', 1).isdigit())
        for s in scores:
            if s.get("id") == score_id:
                s["scores"] = criteria_scores
                s["total"] = round(total, 2)
                if remarks is not None:
                    s["remarks"] = remarks
                s["updated_at"] = datetime.now().isoformat()
                s["admin_overridden"] = True
                save_json(SCORES_FILE, scores)
                return s
        return None

db = DB()
