import os
import json
import uuid
import time
import shutil
from datetime import datetime
from dotenv import load_dotenv

# Load .env if present
load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INITIAL_DATA_DIR = os.path.join(BASE_DIR, "data")

def get_writable_data_dir():
    """Returns a writable directory (e.g. /tmp/agrash_data on Vercel/serverless)"""
    candidate = os.path.join(BASE_DIR, "data")
    try:
        os.makedirs(candidate, exist_ok=True)
        test_file = os.path.join(candidate, ".write_test")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        return candidate
    except Exception:
        tmp_dir = "/tmp/agrash_data"
        os.makedirs(tmp_dir, exist_ok=True)
        for fname in ["events.json", "scores.json", "config.json", "supabase_config.json", "registration.json"]:
            src = os.path.join(INITIAL_DATA_DIR, fname)
            dst = os.path.join(tmp_dir, fname)
            if os.path.exists(src) and not os.path.exists(dst):
                try:
                    shutil.copyfile(src, dst)
                except Exception:
                    pass
        return tmp_dir

DATA_DIR = get_writable_data_dir()
EVENTS_FILE = os.path.join(DATA_DIR, "events.json")
SCORES_FILE = os.path.join(DATA_DIR, "scores.json")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
SUPABASE_CONFIG_FILE = os.path.join(DATA_DIR, "supabase_config.json")

_IN_MEMORY_CACHE = {}

DEFAULT_CRITERIA = [
    {"id": "c1", "name": "Innovation & Concept", "max_marks": 10},
    {"id": "c2", "name": "Technical Execution", "max_marks": 10},
    {"id": "c3", "name": "Design & Functionality", "max_marks": 10},
    {"id": "c4", "name": "Presentation & Q/A", "max_marks": 10},
    {"id": "c5", "name": "Feasibility & Impact", "max_marks": 10}
]

TMP_DATA_DIR = "/tmp/agrash_data"
try:
    os.makedirs(TMP_DATA_DIR, exist_ok=True)
except Exception:
    pass

def load_json(filepath, default):
    base_name = os.path.basename(filepath)
    tmp_path = os.path.join(TMP_DATA_DIR, base_name)

    # 1. Check /tmp (writable in serverless)
    if os.path.exists(tmp_path):
        try:
            with open(tmp_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # 2. Check local file
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # 3. Fallback to initial data folder
    fallback_path = os.path.join(INITIAL_DATA_DIR, base_name)
    if os.path.exists(fallback_path):
        try:
            with open(fallback_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    return default

def save_json(filepath, data):
    base_name = os.path.basename(filepath)
    tmp_path = os.path.join(TMP_DATA_DIR, base_name)

    # Always write to /tmp
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

    # Also try local write
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        pass

EVENT_CATEGORY_MAP = {
    "evt-group-dance": "Group Dance",
    "evt-group-song": "Group Song",
    "evt-declamation": "Declamation",
    "evt-science-exhibition": "Science Exhibition"
}

EVENT_TAB_MAP = {
    "evt-group-dance": {"short": "Dance", "sequence": "Sequence Dance", "result": "Dance Result"},
    "evt-group-song": {"short": "Song", "sequence": "Sequence Song", "result": "Song Result"},
    "evt-declamation": {"short": "Declamation", "sequence": "Sequence Declamation", "result": "Declamation Result"},
    "evt-science-exhibition": {"short": "Exhibition", "sequence": "Sequence Exhibition", "result": "Science Result"}
}

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
        try:
            from seed_events import build_category_events
            default_events = build_category_events()
            existing_ids = {e.get("id") for e in events}
            added = False
            for def_ev in default_events:
                if def_ev["id"] not in existing_ids:
                    events.append(def_ev)
                    added = True
            if added or not events:
                if not events:
                    events = default_events
                save_json(EVENTS_FILE, events)

            # Ensure sequences only contain PRESENT approved teams
            self.sync_event_sequence_from_attendance()
        except Exception as e:
            print(f"⚠️ Error initializing default events: {e}")

    def _init_supabase(self, url=None, key=None):
        """Initialize connection to Supabase cloud database"""
        saved_cfg = load_json(SUPABASE_CONFIG_FILE, {})
        self.supabase_url = url or os.environ.get("SUPABASE_URL") or saved_cfg.get("url", "").strip()
        self.supabase_key = key or os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or saved_cfg.get("key", "").strip()

        if self.supabase_url and self.supabase_key:
            try:
                from supabase import create_client
                client = create_client(self.supabase_url, self.supabase_key)
                client.table("events").select("id").limit(1).execute()
                self.supabase = client
                self.is_supabase_connected = True
                print(f"⚡ [Supabase] Connected successfully to: {self.supabase_url}")
                self.sync_local_to_supabase()
                return True, "Connected to Supabase successfully"
            except Exception as e:
                self.supabase = None
                self.is_supabase_connected = False
                err_msg = str(e)
                print(f"⚠️ [Supabase] Connection notice: {err_msg}. Using local fallback.")
                return False, f"Supabase notice: {err_msg}"
        else:
            self.supabase = None
            self.is_supabase_connected = False
            return False, "Supabase credentials not configured"

    def configure_supabase(self, url, key):
        url = url.strip()
        key = key.strip()
        save_json(SUPABASE_CONFIG_FILE, {"url": url, "key": key})
        env_path = os.path.join(BASE_DIR, ".env")
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
        if not self.is_supabase_connected or not self.supabase:
            return False, "Supabase not connected"

        try:
            local_events = load_json(EVENTS_FILE, [])
            for evt in local_events:
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
        events = self.get_events()
        matched = None
        for e in events:
            if e["id"] == event_id:
                matched = e
                break
        if not matched and event_id in ["judge", "judges", "sequence", "projector", "admin", "default", None, ""]:
            matched = events[0] if events else None
        elif not matched and events:
            matched = events[0]

        if matched:
            comp_tags = matched.get("completed_tags", [])
            comp_set = {c.get("tag_no") for c in comp_tags if isinstance(c, dict) and c.get("tag_no")}
            if comp_set and matched.get("sequence"):
                matched["sequence"] = [item for item in matched["sequence"] if item.get("tag_no") not in comp_set]

        return matched

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

        events.insert(0, new_event)
        save_json(EVENTS_FILE, events)

        if self.is_supabase_connected and self.supabase:
            try:
                self.supabase.table("events").insert(new_event).execute()
            except Exception as e:
                print(f"⚠️ [Supabase] create_event error: {e}")

        return new_event

    def update_event(self, event_id, update_dict):
        events = load_json(EVENTS_FILE, [])
        updated_event = None
        target_id = event_id

        for i, e in enumerate(events):
            if e["id"] == event_id:
                events[i].update(update_dict)
                updated_event = events[i]
                target_id = e["id"]
                break

        # If not found by event_id, fallback to first event if generic
        if not updated_event and events:
            events[0].update(update_dict)
            updated_event = events[0]
            target_id = events[0]["id"]

        if updated_event:
            save_json(EVENTS_FILE, events)

        if self.is_supabase_connected and self.supabase:
            try:
                clean_update = dict(update_dict)
                self.supabase.table("events").update(clean_update).eq("id", target_id).execute()
            except Exception as e:
                print(f"⚠️ [Supabase] update_event error: {e}")

        return updated_event

    def add_judge(self, event_id, judge_name):
        event = self.get_event(event_id)
        if not event:
            return None
        judges = list(event.get("judges", []))
        existing_ids = {j.get("id") for j in judges}
        new_id = f"j{len(judges) + 1}"
        if new_id in existing_ids:
            new_id = f"j{len(judges) + 1}_{int(time.time()) % 10000}"
        judges.append({
            "id": new_id,
            "name": judge_name.strip() if judge_name.strip() else f"Judge {len(judges) + 1}",
            "is_active": True
        })
        return self.update_event(event["id"], {
            "judges": judges,
            "judge_count": len(judges)
        })

    def remove_judge(self, event_id, judge_id):
        event = self.get_event(event_id)
        if not event:
            return None
        judges = [j for j in event.get("judges", []) if j.get("id") != judge_id]
        if not judges:
            return event  # Keep at least one judge
        return self.update_event(event["id"], {
            "judges": judges,
            "judge_count": len(judges)
        })

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

    def update_sequence(self, event_id, new_sequence, current_index=0):
        event = self.get_event(event_id)
        if not event:
            return None
        event["sequence"] = new_sequence
        event["current_index"] = 0
        event["next_transition_time"] = time.time() + event.get("transition_seconds", 120)
        return self.update_event(event["id"], event)

    def set_current_tag(self, event_id, target_index):
        """Brings the selected tag to the top of the queue (index 0) so it becomes live on stage"""
        event = self.get_event(event_id)
        if not event or not event.get("sequence"):
            return None
        seq = list(event["sequence"])
        if 0 <= target_index < len(seq):
            item = seq.pop(target_index)
            seq.insert(0, item)
            event["sequence"] = seq
            event["current_index"] = 0
            event["next_transition_time"] = time.time() + event.get("transition_seconds", 120)
            return self.update_event(event["id"], event)
        return None

    def complete_and_remove_tag(self, event_id, tag_index=None, tag_no=None):
        """Marks tag as completed, removes it permanently from sequence, and next team becomes stage team"""
        event = self.get_event(event_id)
        if not event:
            return None, "Event not found"
        
        seq = list(event.get("sequence", []))
        completed_list = list(event.get("completed_tags", []))

        target_tag = tag_no
        if not target_tag and tag_index is not None and 0 <= tag_index < len(seq):
            target_tag = seq[tag_index].get("tag_no")
        elif not target_tag and seq:
            target_tag = seq[0].get("tag_no")

        if target_tag:
            matched_item = next((item for item in seq if item.get("tag_no") == target_tag), None)
            notes = matched_item.get("notes", "") if matched_item else ""

            # Remove ALL instances of target_tag from sequence
            seq = [item for item in seq if item.get("tag_no") != target_tag]

            # Add to completed list
            if not any(c.get("tag_no") == target_tag for c in completed_list):
                completed_list.append({
                    "tag_no": target_tag,
                    "notes": notes,
                    "completed_at": datetime.now().strftime("%I:%M %p")
                })
            
            event["sequence"] = seq
            event["completed_tags"] = completed_list
            event["current_index"] = 0
            event["next_transition_time"] = time.time() + event.get("transition_seconds", 120)

            updated = self.update_event(event["id"], event)
            new_stage_tag = seq[0]["tag_no"] if seq else "None (Queue Finished)"
            return updated, f"Tag '{target_tag}' completed. Next on stage: '{new_stage_tag}'"
        
        return None, "Could not find tag to complete"

    def restore_completed_tag(self, event_id, tag_no):
        """Restores a completed tag back to the active sequence queue"""
        event = self.get_event(event_id)
        if not event:
            return None
        
        completed_list = list(event.get("completed_tags", []))
        matched = None
        for i, c in enumerate(completed_list):
            if c.get("tag_no") == tag_no:
                matched = completed_list.pop(i)
                break
        
        if matched:
            seq = list(event.get("sequence", []))
            seq.append({"tag_no": matched["tag_no"], "notes": matched.get("notes", "")})
            event["sequence"] = seq
            event["completed_tags"] = completed_list
            return self.update_event(event["id"], event)
        return None

    def sync_event_sequence_from_attendance(self, target_event_id=None):
        """
        Synchronizes the performance sequence dynamically from attendance records.
        Strict rule: A team ONLY enters the active performance queue when approved (PRESENT) at registration.
        If marked ABSENT or PENDING and has no submitted scores, it is removed from the active queue.
        """
        try:
            from registration_service import registration_service
            schools = registration_service.get_all()
        except Exception:
            schools = []

        events = load_json(EVENTS_FILE, [])
        updated_events = []

        for ev in events:
            if target_event_id and ev["id"] != target_event_id:
                continue

            category = EVENT_CATEGORY_MAP.get(ev["id"])
            if not category:
                continue

            current_seq = list(ev.get("sequence", []))
            completed_list = list(ev.get("completed_tags", []))
            completed_tag_set = {c.get("tag_no") for c in completed_list if isinstance(c, dict)}
            existing_tags = [item.get("tag_no") for item in current_seq]

            # 1. Add any school event that is PRESENT and not in queue or completed
            for s in schools:
                ev_entry = next((e for e in s.get("events", []) if e.get("category") == category), None)
                if not ev_entry or not ev_entry.get("tag_no"):
                    continue
                tag_no = ev_entry.get("tag_no")
                status = ev_entry.get("status", "PENDING")
                school_name = s.get("school_name", "")
                room_no = s.get("room_no") or "TBD"
                notes = f"{school_name} [Room: {room_no}]"
                approved_at = ev_entry.get("marked_at") or s.get("arrived_at")

                if status == "PRESENT":
                    if tag_no not in completed_tag_set and tag_no not in existing_tags:
                        current_seq.append({
                            "tag_no": tag_no,
                            "notes": notes,
                            "school_name": school_name,
                            "room_no": room_no,
                            "approved_at": approved_at or datetime.now().strftime("%I:%M %p")
                        })
                        existing_tags.append(tag_no)
                elif status == "ABSENT":
                    # Only remove if explicitly marked ABSENT at registration and not added by coordinator
                    if tag_no in existing_tags:
                        tag_scores = [sc for sc in self.get_scores(ev["id"], tag_no)]
                        if not tag_scores and tag_no not in completed_tag_set:
                            current_seq = [item for item in current_seq if item.get("tag_no") != tag_no or "Added by Stage" in item.get("notes", "")]
                            existing_tags = [item.get("tag_no") for item in current_seq]

            ev["sequence"] = current_seq
            updated_events.append(ev)

        save_json(EVENTS_FILE, events)
        return updated_events

    def _sync_cloud_scores(self, local_scores=None):
        """Fetches cloud-backed scores from Google Apps Script and merges with local container scores"""
        scores = local_scores if local_scores is not None else load_json(SCORES_FILE, [])
        try:
            from seed_events import GSHEET_WEBHOOK_URL
            webhook = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL") or GSHEET_WEBHOOK_URL
            if webhook and webhook.startswith("http"):
                import requests
                resp = requests.get(f"{webhook}?action=get_scores", timeout=4)
                if resp.status_code == 200:
                    data = resp.json()
                    cloud_scores = data.get("scores", [])
                    if cloud_scores:
                        merged_map = {}
                        for s in scores:
                            ev = str(s.get("event_id", "")).strip().lower()
                            t = str(s.get("tag_no", "")).upper().replace(" ", "").replace("-", "")
                            j = str(s.get("judge_id", "")).strip().lower()
                            merged_map[f"{ev}_{t}_{j}"] = s
                        for s in cloud_scores:
                            ev = str(s.get("event_id", "")).strip().lower()
                            t = str(s.get("tag_no", "")).upper().replace(" ", "").replace("-", "")
                            j = str(s.get("judge_id", "")).strip().lower()
                            k = f"{ev}_{t}_{j}"
                            if k not in merged_map:
                                merged_map[k] = s
                            else:
                                s_ts = s.get("updated_at", "")
                                ex_ts = merged_map[k].get("updated_at", "")
                                if s_ts >= ex_ts:
                                    merged_map[k] = s
                        scores = list(merged_map.values())
                        save_json(SCORES_FILE, scores)
        except Exception:
            pass
        return scores

    def get_scores(self, event_id=None, tag_no=None, sync_cloud=False):
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

        if sync_cloud:
            scores = self._sync_cloud_scores()
        else:
            scores = load_json(SCORES_FILE, [])

        if event_id:
            scores = [s for s in scores if s.get("event_id") == event_id or event_id in str(s.get("event_id", ""))]
        if tag_no:
            t_norm = str(tag_no).upper().replace(" ", "").replace("-", "")
            scores = [s for s in scores if str(s.get("tag_no", "")).upper().replace(" ", "").replace("-", "") == t_norm]
        return scores

    def submit_score(self, event_id, tag_no, judge_id, judge_name, criteria_scores, remarks=""):
        # 1. First merge all existing judges scores from cloud so no other judge's score is lost
        scores = self._sync_cloud_scores()
        total = sum(float(v) for v in criteria_scores.values() if v is not None and str(v).replace('.', '', 1).isdigit())

        existing_idx = None
        t_norm = str(tag_no).upper().replace(" ", "").replace("-", "")
        for i, s in enumerate(scores):
            s_tag_norm = str(s.get("tag_no", "")).upper().replace(" ", "").replace("-", "")
            if (s.get("event_id") == event_id or event_id in str(s.get("event_id", ""))) and s_tag_norm == t_norm and s.get("judge_id") == judge_id:
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

        # 2. Cloud backup to Google Apps Script Properties synchronously
        try:
            from seed_events import GSHEET_WEBHOOK_URL
            webhook = os.environ.get("GOOGLE_SHEET_WEBHOOK_URL") or GSHEET_WEBHOOK_URL
            if webhook and webhook.startswith("http"):
                import requests
                requests.post(webhook, json={"action": "save_score", "score": score_entry}, timeout=8)
        except Exception:
            pass

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
