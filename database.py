import os
import json
import uuid
import time
from datetime import datetime
from dotenv import load_dotenv

# Load .env if present
load_dotenv()

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

EVENTS_FILE = os.path.join(DATA_DIR, "events.json")
SCORES_FILE = os.path.join(DATA_DIR, "scores.json")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
SUPABASE_CONFIG_FILE = os.path.join(DATA_DIR, "supabase_config.json")

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
        self.supabase = None
        self.is_supabase_connected = False
        self.supabase_url = ""
        self.supabase_key = ""
        self._init_defaults()
        self._init_supabase()

    def _init_defaults(self):
        events = load_json(EVENTS_FILE, [])
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

    def _init_supabase(self, url=None, key=None):
        """Initialize connection to Supabase cloud database"""
        saved_cfg = load_json(SUPABASE_CONFIG_FILE, {})
        self.supabase_url = url or os.environ.get("SUPABASE_URL") or saved_cfg.get("url", "").strip()
        self.supabase_key = key or os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or saved_cfg.get("key", "").strip()

        if self.supabase_url and self.supabase_key:
            try:
                from supabase import create_client
                client = create_client(self.supabase_url, self.supabase_key)
                # Test query to check credentials and connection
                client.table("events").select("id").limit(1).execute()
                self.supabase = client
                self.is_supabase_connected = True
                print(f"⚡ [Supabase] Connected successfully to: {self.supabase_url}")
                # Synchronize initial events if empty
                self.sync_local_to_supabase()
                return True, "Connected to Supabase successfully"
            except Exception as e:
                self.supabase = None
                self.is_supabase_connected = False
                err_msg = str(e)
                print(f"⚠️ [Supabase] Connection failed: {err_msg}. Using local storage fallback.")
                return False, f"Supabase connection failed: {err_msg}"
        else:
            self.supabase = None
            self.is_supabase_connected = False
            return False, "Supabase credentials not configured"

    def configure_supabase(self, url, key):
        """Save credentials and establish Supabase connection"""
        url = url.strip()
        key = key.strip()
        save_json(SUPABASE_CONFIG_FILE, {"url": url, "key": key})
        # Also write to .env
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        try:
            with open(env_path, "w", encoding="utf-8") as f:
                f.write(f"SUPABASE_URL={url}\nSUPABASE_KEY={key}\n")
        except Exception:
            pass

        return self._init_supabase(url, key)

    def get_supabase_status(self):
        return {
            "connected": self.is_supabase_connected,
            "url": self.supabase_url if self.supabase_url else "",
            "has_key": bool(self.supabase_key)
        }

    def sync_local_to_supabase(self):
        """Push local events and scores to Supabase if not present"""
        if not self.is_supabase_connected or not self.supabase:
            return False, "Supabase not connected"

        try:
            local_events = load_json(EVENTS_FILE, [])
            for evt in local_events:
                # Upsert into supabase
                clean_evt = dict(evt)
                self.supabase.table("events").upsert(clean_evt).execute()

            local_scores = load_json(SCORES_FILE, [])
            for sc in local_scores:
                clean_sc = dict(sc)
                self.supabase.table("scores").upsert(clean_sc).execute()

            return True, f"Synchronized {len(local_events)} events and {len(local_scores)} scores to Supabase!"
        except Exception as e:
            return False, f"Sync error: {str(e)}"

    def get_events(self):
        if self.is_supabase_connected and self.supabase:
            try:
                res = self.supabase.table("events").select("*").order("created_at", desc=True).execute()
                if res.data:
                    save_json(EVENTS_FILE, res.data)
                    return res.data
            except Exception as e:
                print(f"⚠️ [Supabase] get_events error: {e}")
        return load_json(EVENTS_FILE, [])

    def get_event(self, event_id):
        if self.is_supabase_connected and self.supabase:
            try:
                res = self.supabase.table("events").select("*").eq("id", event_id).execute()
                if res.data and len(res.data) > 0:
                    return res.data[0]
            except Exception as e:
                print(f"⚠️ [Supabase] get_event error: {e}")

        events = self.get_events()
        for e in events:
            if e["id"] == event_id:
                return e
        if events:
            return events[0]
        return None

    def create_event(self, name, description, judge_names, tag_numbers, criteria=None, google_sheet_url=""):
        events = load_json(EVENTS_FILE, [])
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

        # Save locally
        events.insert(0, new_event)
        save_json(EVENTS_FILE, events)

        # Save to Supabase
        if self.is_supabase_connected and self.supabase:
            try:
                self.supabase.table("events").insert(new_event).execute()
            except Exception as e:
                print(f"⚠️ [Supabase] create_event error: {e}")

        return new_event

    def update_event(self, event_id, update_dict):
        events = load_json(EVENTS_FILE, [])
        updated_event = None
        for i, e in enumerate(events):
            if e["id"] == event_id:
                events[i].update(update_dict)
                updated_event = events[i]
                break

        if updated_event:
            save_json(EVENTS_FILE, events)

        if self.is_supabase_connected and self.supabase:
            try:
                self.supabase.table("events").update(update_dict).eq("id", event_id).execute()
            except Exception as e:
                print(f"⚠️ [Supabase] update_event error: {e}")

        return updated_event

    def delete_event(self, event_id):
        events = load_json(EVENTS_FILE, [])
        events = [e for e in events if e["id"] != event_id]
        save_json(EVENTS_FILE, events)

        if self.is_supabase_connected and self.supabase:
            try:
                self.supabase.table("events").delete().eq("id", event_id).execute()
                self.supabase.table("scores").delete().eq("event_id", event_id).execute()
            except Exception as e:
                print(f"⚠️ [Supabase] delete_event error: {e}")

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
        if self.is_supabase_connected and self.supabase:
            try:
                query = self.supabase.table("scores").select("*")
                if event_id:
                    query = query.eq("event_id", event_id)
                if tag_no:
                    query = query.eq("tag_no", tag_no)
                res = query.execute()
                if res.data is not None:
                    return res.data
            except Exception as e:
                print(f"⚠️ [Supabase] get_scores error: {e}")

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

        # Upsert to Supabase
        if self.is_supabase_connected and self.supabase:
            try:
                self.supabase.table("scores").upsert(score_entry).execute()
            except Exception as e:
                print(f"⚠️ [Supabase] submit_score error: {e}")

        return score_entry

    def admin_override_score(self, score_id, criteria_scores, remarks=""):
        scores = load_json(SCORES_FILE, [])
        total = sum(float(v) for v in criteria_scores.values() if v is not None and str(v).replace('.', '', 1).isdigit())
        updated_score = None
        for s in scores:
            if s.get("id") == score_id:
                s["scores"] = criteria_scores
                s["total"] = round(total, 2)
                if remarks is not None:
                    s["remarks"] = remarks
                s["updated_at"] = datetime.now().isoformat()
                s["admin_overridden"] = True
                updated_score = s
                save_json(SCORES_FILE, scores)
                break

        if updated_score and self.is_supabase_connected and self.supabase:
            try:
                self.supabase.table("scores").upsert(updated_score).execute()
            except Exception as e:
                print(f"⚠️ [Supabase] admin_override_score error: {e}")

        return updated_score

db = DB()
