import os
import json
import logging
import threading
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("sheets_service")

IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_time_str():
    return datetime.now(IST).strftime("%I:%M %p")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

class SheetsService:
    def __init__(self, credentials_path="credentials.json"):
        self.credentials_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), credentials_path)
        self.client = None

    def _get_client(self):
        try:
            import gspread
            from google.oauth2.service_account import Credentials

            sa_json_env = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
            if sa_json_env:
                try:
                    info = json.loads(sa_json_env)
                    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
                    return gspread.authorize(creds)
                except Exception as e:
                    logger.error(f"Error loading GOOGLE_SERVICE_ACCOUNT_JSON env: {e}")

            if os.path.exists(self.credentials_path):
                creds = Credentials.from_service_account_file(self.credentials_path, scopes=SCOPES)
                return gspread.authorize(creds)
        except Exception as e:
            logger.error(f"Error authorizing gspread: {e}")
        return None

    def trigger_attendance_sync(self, event_id=None):
        """Ultra-fast sync for attendance and dynamic sequence updates without touching scores"""
        def _worker():
            try:
                self.sync_master_registrations()
                if event_id:
                    self.sync_event_sequence(event_id)
                else:
                    from database import db
                    for ev in db.get_events():
                        self.sync_event_sequence(ev["id"])
            except Exception as ex:
                logger.error(f"Attendance sync error: {ex}")

        is_serverless = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
        if is_serverless:
            _worker()
        else:
            thread = threading.Thread(target=_worker, daemon=True)
    def trigger_sequence_only_sync(self, event_id):
        """Ultra-fast sequence sync targeting ONLY the dedicated sequence sheet tab without touching scores or championship"""
        def _seq_worker():
            try:
                if event_id:
                    self.sync_event_sequence(event_id)
            except Exception as ex:
                logger.error(f"Sequence sync error: {ex}")

        is_serverless = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
        if is_serverless:
            _seq_worker()
        else:
            threading.Thread(target=_seq_worker, daemon=True).start()

    def trigger_background_sync(self, event_id=None, sync_registration=False, sync_sequence=True):
        """Spawns non-blocking background thread to update connected Google Sheet result, sequence, and championship tabs"""
        def _sync_worker():
            try:
                if event_id:
                    self.auto_sync_event(event_id)
                    if sync_sequence:
                        self.sync_event_sequence(event_id)
                else:
                    self.sync_all_events()
                self.sync_final_championship()
                if sync_registration:
                    self.sync_master_registrations()
            except Exception as ex:
                logger.error(f"Sync worker error: {ex}")

        # Vercel / AWS Lambda freeze daemon background threads before they finish HTTP calls.
        is_serverless = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
        if is_serverless:
            _sync_worker()
        else:
            thread = threading.Thread(target=_sync_worker, daemon=True)
            thread.start()

    def calculate_championship_data(self):
        """Calculates 4-event combined score leaderboard across all schools with new rubrics (Dance:50, Song:50, Dec:60, Sci:50 = 210)"""
        try:
            from database import db
            from registration_service import registration_service

            all_scores = db.get_scores()
            events = db.get_events()
            events_dict = {ev["id"]: ev for ev in events}

            def get_event_max(ev_id, default=50):
                ev = events_dict.get(ev_id, {})
                return sum(c.get("max_marks", 10) for c in ev.get("criteria", [])) or default

            dance_max = get_event_max("evt-group-dance", 50)
            song_max = get_event_max("evt-group-song", 50)
            dec_max = get_event_max("evt-declamation", 60)
            sci_max = get_event_max("evt-science-exhibition", 50)
            combined_max = dance_max + song_max + dec_max + sci_max

            def clean_norm_tag(t):
                return str(t or "").upper().replace(" ", "").replace("-", "")

            def get_tag_avg(event_id, tag_no):
                if not tag_no:
                    return None, "-"
                t_clean = clean_norm_tag(tag_no)
                tag_scores = [
                    s for s in all_scores
                    if (s.get("event_id") == event_id or event_id in str(s.get("event_id", "")))
                    and clean_norm_tag(s.get("tag_no")) == t_clean
                ]
                if not tag_scores:
                    return 0, f"{tag_no} (Pending)"
                totals = [s.get("total", 0) for s in tag_scores]
                avg = round(sum(totals) / len(totals), 2)
                return avg, f"{tag_no} ({avg})"

            schools_list = registration_service.get_all()
            results = []

            if schools_list:
                for s in schools_list:
                    school = s.get("school_name", "")
                    room = s.get("room_no") or "-"
                    ev_map = {ev.get("category"): ev.get("tag_no") for ev in s.get("events", [])}

                    dance_tag = ev_map.get("Group Dance", "")
                    song_tag = ev_map.get("Group Song", "")
                    dec_tag = ev_map.get("Declamation", "")
                    sci_tag = ev_map.get("Science Exhibition", "")

                    d_avg, d_str = get_tag_avg("evt-group-dance", dance_tag)
                    s_avg, s_str = get_tag_avg("evt-group-song", song_tag)
                    dc_avg, dc_str = get_tag_avg("evt-declamation", dec_tag)
                    se_avg, se_str = get_tag_avg("evt-science-exhibition", sci_tag)

                    scored_vals = [v for v in [d_avg, s_avg, dc_avg, se_avg] if v is not None and v > 0]
                    total_score = round(sum(scored_vals), 2)
                    events_done = len(scored_vals)
                    overall_avg = round(total_score / events_done, 2) if events_done > 0 else 0

                    results.append({
                        "school": school,
                        "room": room,
                        "dance": d_str,
                        "dance_score": d_avg or 0,
                        "dance_max": dance_max,
                        "song": s_str,
                        "song_score": s_avg or 0,
                        "song_max": song_max,
                        "declamation": dc_str,
                        "declamation_score": dc_avg or 0,
                        "declamation_max": dec_max,
                        "science": se_str,
                        "science_score": se_avg or 0,
                        "science_max": sci_max,
                        "total_score": total_score,
                        "combined_max": combined_max,
                        "overall_avg": overall_avg,
                        "events_done": events_done
                    })
            else:
                from create_excel import schools_data
                for row in schools_data:
                    school = row[0]
                    room = row[9] or "-"

                    dance_tag = row[2] if row[1] == "YES" else ""
                    song_tag = row[4] if row[3] == "YES" else ""
                    dec_tag = row[6] if row[5] == "YES" else ""
                    sci_tag = row[8] if row[7] == "YES" else ""

                    d_avg, d_str = get_tag_avg("evt-group-dance", dance_tag)
                    s_avg, s_str = get_tag_avg("evt-group-song", song_tag)
                    dc_avg, dc_str = get_tag_avg("evt-declamation", dec_tag)
                    se_avg, se_str = get_tag_avg("evt-science-exhibition", sci_tag)

                    scored_vals = [v for v in [d_avg, s_avg, dc_avg, se_avg] if v is not None and v > 0]
                    total_score = round(sum(scored_vals), 2)
                    events_done = len(scored_vals)
                    overall_avg = round(total_score / events_done, 2) if events_done > 0 else 0

                    results.append({
                        "school": school,
                        "room": room,
                        "dance": d_str,
                        "dance_score": d_avg or 0,
                        "dance_max": dance_max,
                        "song": s_str,
                        "song_score": s_avg or 0,
                        "song_max": song_max,
                        "declamation": dc_str,
                        "declamation_score": dc_avg or 0,
                        "declamation_max": dec_max,
                        "science": se_str,
                        "science_score": se_avg or 0,
                        "science_max": sci_max,
                        "total_score": total_score,
                        "combined_max": combined_max,
                        "overall_avg": overall_avg,
                        "events_done": events_done
                    })

            results.sort(key=lambda x: (x["total_score"], x["overall_avg"]), reverse=True)
            current_rank = 1
            for i, r in enumerate(results):
                r["school_name"] = r.get("school", "")
                if r.get("total_score", 0) > 0:
                    if i > 0 and results[i - 1].get("total_score", 0) > r.get("total_score", 0):
                        current_rank = i + 1
                    r["rank"] = current_rank
                    r["display_rank"] = f"#{current_rank}"
                else:
                    r["rank"] = None
                    r["display_rank"] = "-"
            return results
        except Exception as e:
            logger.error(f"Error calculating championship data: {e}")
            return []

    def calculate_event_winners(self):
        """Calculates individual event rankings and winners for each of the 4 categories"""
        try:
            from database import db
            from registration_service import registration_service

            all_scores = db.get_scores()
            events = db.get_events()
            events_dict = {ev["id"]: ev for ev in events}

            categories = [
                {
                    "event_id": "evt-group-dance",
                    "event_name": "Group Dance Championship",
                    "short_name": "Group Dance",
                    "tag_idx": 2,
                    "reg_idx": 1,
                    "icon": "sparkles"
                },
                {
                    "event_id": "evt-group-song",
                    "event_name": "Group Song Championship",
                    "short_name": "Group Song",
                    "tag_idx": 4,
                    "reg_idx": 3,
                    "icon": "music"
                },
                {
                    "event_id": "evt-declamation",
                    "event_name": "Declamation Championship",
                    "short_name": "Declamation",
                    "tag_idx": 6,
                    "reg_idx": 5,
                    "icon": "mic"
                },
                {
                    "event_id": "evt-science-exhibition",
                    "event_name": "Science Exhibition Championship",
                    "short_name": "Science Exhibition",
                    "tag_idx": 8,
                    "reg_idx": 7,
                    "icon": "atom"
                }
            ]

            category_results = {}
            all_schools = registration_service.get_all()

            for cat in categories:
                ev_id = cat["event_id"]
                ev_data = events_dict.get(ev_id, {})
                judges = ev_data.get("judges", [])
                total_judges = len(judges)

                cat_scores = [s for s in all_scores if s.get("event_id") == ev_id]

                # Map schools that participate in this category dynamically from registration
                team_items = []
                for s in all_schools:
                    school_name = s.get("school_name", "")
                    room_no = s.get("room_no") or "TBD"
                    ev_match = next((e for e in s.get("events", []) if e.get("category") == cat["short_name"] or e.get("event_id") == ev_id), None)
                    if ev_match and ev_match.get("tag_no"):
                        tag_no = ev_match["tag_no"]

                        tag_scores = [s_sc for s_sc in cat_scores if str(s_sc.get("tag_no", "")).upper().replace(" ", "").replace("-", "") == str(tag_no).upper().replace(" ", "").replace("-", "")]
                        totals = [s_sc.get("total", 0) for s_sc in tag_scores]
                        judges_scored = len(totals)
                        avg_score = round(sum(totals) / judges_scored, 2) if judges_scored > 0 else 0

                        # Check status
                        is_completed = any((c.get("tag_no") if isinstance(c, dict) else str(c)) == tag_no for c in ev_data.get("completed_tags", []))
                        is_live = bool(ev_data.get("sequence") and ev_data["sequence"][0]["tag_no"] == tag_no)
                        status = "COMPLETED" if is_completed else ("LIVE ON STAGE" if is_live else ("EVALUATED" if judges_scored > 0 else "IN QUEUE"))

                        team_items.append({
                            "tag_no": tag_no,
                            "school_name": school_name,
                            "room_no": room_no,
                            "average_score": avg_score,
                            "judges_scored": judges_scored,
                            "total_judges": total_judges,
                            "status": status
                        })

                # Sort by average score descending, then judges scored
                team_items.sort(key=lambda x: (x["average_score"], x["judges_scored"]), reverse=True)

                # Assign ranks with proper tie handling
                current_rank = 1
                for idx, team in enumerate(team_items):
                    if team["average_score"] > 0:
                        if idx > 0 and team_items[idx - 1]["average_score"] > team["average_score"]:
                            current_rank = idx + 1
                        team["rank"] = current_rank
                        team["display_rank"] = f"#{current_rank}"
                        if current_rank == 1:
                            team["standing"] = "🥇 1st Place (Gold Winner)"
                        elif current_rank == 2:
                            team["standing"] = "🥈 2nd Place (Silver Winner)"
                        elif current_rank == 3:
                            team["standing"] = "🥉 3rd Place (Bronze Winner)"
                        else:
                            team["standing"] = f"Position #{current_rank}"
                    else:
                        team["rank"] = "-"
                        team["display_rank"] = "-"
                        team["standing"] = "Pending Evaluation"

                top3 = [t for t in team_items if t["average_score"] > 0][:3]

                category_results[ev_id] = {
                    "event_id": ev_id,
                    "event_name": cat["event_name"],
                    "short_name": cat["short_name"],
                    "icon": cat["icon"],
                    "total_participants": len(team_items),
                    "evaluated_count": sum(1 for t in team_items if t["average_score"] > 0),
                    "top3": top3,
                    "rankings": team_items
                }

            return category_results
        except Exception as e:
            logger.error(f"Error calculating individual event winners: {e}")
            return {}

    def sync_final_championship(self, webhook_url=None):
        """Pushes the combined 4-event Championship results to Google Sheet 'Championship' tab (Max 210)"""
        try:
            from database import db
            championship_list = self.calculate_championship_data()
            if not championship_list:
                return False, "No data available"

            events = db.get_events()
            webhook = webhook_url
            if not webhook and events:
                webhook = events[0].get("google_sheet_webhook_url") or os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")

            events_dict = {ev["id"]: ev for ev in events}
            def get_ev_max(ev_id, default=50):
                ev = events_dict.get(ev_id, {})
                return sum(c.get("max_marks", 10) for c in ev.get("criteria", [])) or default

            dance_m = get_ev_max("evt-group-dance", 50)
            song_m = get_ev_max("evt-group-song", 50)
            dec_m = get_ev_max("evt-declamation", 60)
            sci_m = get_ev_max("evt-science-exhibition", 50)
            comb_m = dance_m + song_m + dec_m + sci_m

            headers = [
                "Rank",
                "School Name",
                "Room / Flat",
                f"Group Dance Total (/{dance_m})",
                f"Group Song Total (/{song_m})",
                f"Declamation Total (/{dec_m})",
                f"Science Exhibition Total (/{sci_m})",
                f"Grand Total (4-Event Sum /{comb_m})",
                "Events Evaluated",
                "Overall Standing & Award",
                "Last Updated"
            ]

            final_rows = [headers]
            for idx, r in enumerate(championship_list, start=1):
                if idx == 1 and r["total_score"] > 0:
                    standing = "🏆 1st Place - Champion (Gold Trophy)"
                elif idx == 2 and r["total_score"] > 0:
                    standing = "🥈 2nd Place - 1st Runner Up (Silver Trophy)"
                elif idx == 3 and r["total_score"] > 0:
                    standing = "🥉 3rd Place - 2nd Runner Up (Bronze Trophy)"
                elif idx <= 10 and r["total_score"] > 0:
                    standing = f"⭐ Top 10 Finalist Trophy (#{idx})"
                elif r["total_score"] > 0:
                    standing = f"Position #{idx}"
                else:
                    standing = "Pending Evaluation"

                rank_str = f"#{idx}" if r["total_score"] > 0 else "-"
                row = [
                    rank_str,
                    r["school"],
                    r["room"],
                    r["dance"],
                    r["song"],
                    r["declamation"],
                    r["science"],
                    r["total_score"] if r["total_score"] > 0 else "-",
                    f"{r['events_done']}/4",
                    standing,
                    get_ist_time_str()
                ]
                final_rows.append(row)

            if webhook and webhook.startswith("http"):
                import requests
                resp = requests.post(
                    webhook,
                    json={
                        "event_name": "Agrash Overall Championship",
                        "tab_name": "Championship",
                        "rows": final_rows,
                        "timestamp": datetime.now().isoformat()
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=25,
                    allow_redirects=True
                )
                logger.info(f"⚡ [Championship Webhook] Synced successfully! Status: {resp.status_code}")
                return True, "Championship tab synced successfully"

            return False, "No webhook configured"
        except Exception as e:
            logger.error(f"Error syncing final championship: {e}")
            return False, str(e)

    def sync_master_registrations(self, webhook_url=None):
        """Pushes the master school registrations & attendance matrix to Google Sheet 'Attendance' tab"""
        try:
            from database import db
            from registration_service import registration_service

            schools = registration_service.get_all()
            if not schools:
                return False, "No registration data available"

            events = db.get_events()
            webhook = webhook_url
            if not webhook and events:
                webhook = events[0].get("google_sheet_webhook_url") or os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")

            headers = [
                "S.No",
                "School Name",
                "Assigned Desk",
                "Room / Flat",
                "Group Dance",
                "Group Song",
                "Declamation",
                "Science Exhibition",
                "Arrival Status",
                "Check-In Time",
                "Last Updated"
            ]

            rows = [headers]
            for idx, s in enumerate(schools, start=1):
                ev_map = {ev.get("category", ""): ev for ev in s.get("events", [])}

                def fmt_ev(cat):
                    ev = ev_map.get(cat)
                    if not ev or not ev.get("tag_no"):
                        return "-"
                    st = ev.get("status", "PENDING")
                    icon = "✅ PRESENT" if st == "PRESENT" else ("❌ ABSENT" if st == "ABSENT" else "⏳ PENDING")
                    return f"{ev['tag_no']} ({icon})"

                d_str = fmt_ev("Group Dance")
                s_str = fmt_ev("Group Song")
                dc_str = fmt_ev("Declamation")
                se_str = fmt_ev("Science Exhibition")

                arrived_status = "🟢 ARRIVED" if s.get("is_arrived") else "⏳ PENDING"
                check_in = s.get("arrived_at") or "-"

                rows.append([
                    f"#{idx}",
                    s.get("school_name", ""),
                    f"Desk {s.get('desk_no', 1)}",
                    s.get("room_no", "TBD"),
                    d_str,
                    s_str,
                    dc_str,
                    se_str,
                    arrived_status,
                    check_in,
                    get_ist_time_str()
                ])

            if webhook and webhook.startswith("http"):
                import requests
                resp = requests.post(
                    webhook,
                    json={
                        "event_name": "Agrash Attendance Matrix",
                        "tab_name": "Attendance",
                        "rows": rows,
                        "timestamp": datetime.now().isoformat()
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=25,
                    allow_redirects=True
                )
                logger.info(f"⚡ [Attendance Webhook] Synced successfully! Status: {resp.status_code}")
                return True, "Attendance tab synced successfully"

            return False, "No webhook configured"
        except Exception as e:
            logger.error(f"Error syncing attendance: {e}")
            return False, str(e)

    def sync_event_sequence(self, event_id, webhook_url=None):
        """Pushes dynamic stage sequence of PRESENT teams to dedicated 'Sequence <Event>' tab in Google Sheets"""
        try:
            from database import db
            event = db.get_event(event_id)
            if not event:
                return False, "Event not found"

            SEQUENCE_TAB_MAP = {
                "evt-group-dance": "Sequence Dance",
                "evt-group-song": "Sequence Song",
                "evt-declamation": "Sequence Declamation",
                "evt-science-exhibition": "Sequence Exhibition"
            }
            tab_name = SEQUENCE_TAB_MAP.get(event["id"], f"Sequence {event.get('name', 'Event')}")

            headers = [
                "Seq Order",
                "Tag No",
                "School Name",
                "Room / Flat",
                "Stage Status",
                "Approved Time",
                "Last Updated"
            ]

            rows = [headers]
            seq_items = event.get("sequence", [])
            for idx, item in enumerate(seq_items):
                tag_no = item.get("tag_no", "")
                school_name = item.get("school_name", "")
                room_no = item.get("room_no", "")
                notes = item.get("notes", "")
                if not school_name and notes:
                    if "[Room:" in notes:
                        parts = notes.split("[Room:")
                        school_name = parts[0].strip()
                        room_no = parts[1].replace("]", "").strip()
                    else:
                        school_name = notes

                stage_status = "🔴 LIVE ON STAGE" if idx == 0 else f"⏳ IN QUEUE (WAITING #{idx + 1})"
                approved_time = item.get("approved_at") or get_ist_time_str()

                rows.append([
                    f"#{idx + 1}",
                    tag_no,
                    school_name,
                    room_no or "TBD",
                    stage_status,
                    approved_time,
                    get_ist_time_str()
                ])

            # Add completed teams section
            completed_items = event.get("completed_tags", [])
            for c in completed_items:
                tag_no = c.get("tag_no", "") if isinstance(c, dict) else str(c)
                notes = c.get("notes", "") if isinstance(c, dict) else ""
                school_name = notes.split("[Room:")[0].strip() if "[Room:" in notes else notes
                room_no = notes.split("[Room:")[1].replace("]", "").strip() if "[Room:" in notes else "TBD"

                rows.append([
                    "DONE",
                    tag_no,
                    school_name,
                    room_no or "TBD",
                    "✅ COMPLETED",
                    c.get("completed_at") or "-",
                    get_ist_time_str()
                ])

            if len(rows) == 1:
                rows.append([
                    "-",
                    "-",
                    "No teams registered present yet",
                    "-",
                    "WAITING FOR DESK APPROVAL",
                    "-",
                    get_ist_time_str()
                ])

            webhook = webhook_url or event.get("google_sheet_webhook_url") or os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")
            if webhook and webhook.startswith("http"):
                import requests
                resp = requests.post(
                    webhook,
                    json={
                        "event_name": f"Agrash Sequence - {tab_name}",
                        "tab_name": tab_name,
                        "rows": rows,
                        "timestamp": datetime.now().isoformat()
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=25,
                    allow_redirects=True
                )
                logger.info(f"⚡ [Sequence Webhook] Updated '{tab_name}'! Status: {resp.status_code}")
                return True, f"Sequence updated for '{tab_name}'"

            return False, "No webhook configured"
        except Exception as e:
            logger.error(f"Error syncing event sequence: {e}")
            return False, str(e)

    def auto_sync_event(self, event_id, webhook_url=None):
        """Automatically pushes live event result sheet to dedicated '<Event> Result' tab in Google Sheets"""
        try:
            from database import db
            from registration_service import registration_service

            event = db.get_event(event_id)
            if not event:
                return False, "Event not found"

            RESULT_TAB_MAP = {
                "evt-group-dance": "Dance Result",
                "evt-group-song": "Song Result",
                "evt-declamation": "Declamation Result",
                "evt-science-exhibition": "Science Result"
            }
            tab_name = RESULT_TAB_MAP.get(event["id"], f"{event.get('name', 'Event')} Result")

            scores = db.get_scores(event_id=event["id"])
            judges = event.get("judges", [])
            
            # Map attendance status for all tags
            all_reg = registration_service.get_all()
            tag_att_map = {}
            for s in all_reg:
                for ev in s.get("events", []):
                    st = ev.get("status", "PENDING")
                    if st == "PRESENT":
                        st_display = "PRESENT (✅)"
                    elif st == "ABSENT":
                        st_display = "ABSENT (❌)"
                    else:
                        st_display = "PENDING (⏳)"
                    tag_att_map[ev["tag_no"]] = st_display

            all_tags = []
            tag_meta = {}

            EVENT_CAT_MAP = {
                "evt-group-dance": "Group Dance",
                "evt-group-song": "Group Song",
                "evt-declamation": "Declamation",
                "evt-science-exhibition": "Science Exhibition"
            }
            target_cat = EVENT_CAT_MAP.get(event["id"], event.get("name", ""))

            # 1. Include all registered schools for this category
            for s in all_reg:
                sch_name = s.get("school_name", "")
                r_no = s.get("room_no") or "TBD"
                for ev in s.get("events", []):
                    if ev.get("category") == target_cat and ev.get("tag_no"):
                        t_no = ev["tag_no"]
                        if t_no not in all_tags:
                            all_tags.append(t_no)
                            tag_meta[t_no] = f"{sch_name} [Room: {r_no}]"

            # 2. Include tags from active sequence
            for item in event.get("sequence", []):
                t_no = item.get("tag_no")
                if t_no and t_no not in all_tags:
                    all_tags.append(t_no)
                    tag_meta[t_no] = item.get("notes", "")

            # 3. Include tags from completed
            for c in event.get("completed_tags", []):
                t_no = c.get("tag_no") if isinstance(c, dict) else str(c)
                if t_no and t_no not in all_tags:
                    all_tags.append(t_no)
                    tag_meta[t_no] = c.get("notes", "") if isinstance(c, dict) else ""

            # 4. Include any scored tags
            for sc in scores:
                t_no = sc.get("tag_no")
                if t_no and t_no not in all_tags:
                    all_tags.append(t_no)
                    tag_meta[t_no] = f"Tag {t_no}"

            def clean_norm_tag(t):
                return str(t or "").upper().replace(" ", "").replace("-", "")

            # Distinct Attendance (Present/Absent) column
            total_max = sum(c.get("max_marks", 10) for c in event.get("criteria", [])) or 50
            headers = ["Rank", "Tag No", "School & Details", "Attendance (Present/Absent)"]
            for j in judges:
                headers.append(f"{j['name']} (/{total_max})")
            headers.extend([f"Overall Average (/{total_max})", "Judges Scored", "Stage Status", "Last Updated"])

            rows_data = []
            for tag_no in all_tags:
                t_clean = clean_norm_tag(tag_no)
                tag_scores = [s for s in scores if clean_norm_tag(s.get("tag_no")) == t_clean]
                is_completed = any(clean_norm_tag(c.get("tag_no") if isinstance(c, dict) else c) == t_clean for c in event.get("completed_tags", []))
                is_live = bool(event.get("sequence") and clean_norm_tag(event["sequence"][0]["tag_no"]) == t_clean)
                
                stage_status = "COMPLETED" if is_completed else ("LIVE ON STAGE" if is_live else "IN QUEUE")
                att_status = tag_att_map.get(tag_no, "PENDING (⏳)")

                j_totals = []
                row_judge_cols = []
                for j in judges:
                    j_score = next((s for s in tag_scores if s.get("judge_id") == j["id"]), None)
                    if j_score:
                        row_judge_cols.append(j_score["total"])
                        j_totals.append(j_score["total"])
                    else:
                        row_judge_cols.append("Pending")

                avg = round(sum(j_totals) / len(j_totals), 2) if j_totals else 0
                rows_data.append({
                    "tag_no": tag_no,
                    "details": tag_meta.get(tag_no, ""),
                    "attendance": att_status,
                    "judge_scores": row_judge_cols,
                    "avg": avg,
                    "count": len(j_totals),
                    "status": stage_status
                })

            # Sort by highest average
            scored_rows = [r for r in rows_data if r["count"] > 0]
            unscored_rows = [r for r in rows_data if r["count"] == 0]
            scored_rows.sort(key=lambda x: x["avg"], reverse=True)
            
            final_table_rows = [headers]
            for idx, r in enumerate(scored_rows, start=1):
                row = [f"#{idx}", r["tag_no"], r["details"], r["attendance"]]
                row.extend(r["judge_scores"])
                row.extend([r["avg"], f"{r['count']}/{len(judges)}", r["status"], get_ist_time_str()])
                final_table_rows.append(row)

            for r in unscored_rows:
                row = ["-", r["tag_no"], r["details"], r["attendance"]]
                row.extend(r["judge_scores"])
                row.extend(["-", f"0/{len(judges)}", r["status"], get_ist_time_str()])
                final_table_rows.append(row)

            # Push to Google Sheet Webhook
            webhook_url = webhook_url or event.get("google_sheet_webhook_url") or os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")

            if webhook_url and webhook_url.startswith("http"):
                import requests
                resp = requests.post(
                    webhook_url,
                    json={
                        "event_name": f"Agrash Result - {tab_name}",
                        "tab_name": tab_name,
                        "rows": final_table_rows,
                        "timestamp": datetime.now().isoformat()
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=25,
                    allow_redirects=True
                )
                logger.info(f"⚡ [Google Sheet Webhook] Auto-updated '{tab_name}'! Status: {resp.status_code}")
                return True, f"Auto-updated '{tab_name}' via Webhook"

            return False, "No Google Sheet Webhook configured"
        except Exception as e:
            logger.error(f"Auto-sync error: {e}")
            return False, str(e)

    def pull_from_agrash_sheet(self, webhook_url=None):
        """Pulls school registration data directly from Google Sheet 'Agrash Registrations' tab with dual high-speed fetch"""
        try:
            import urllib.request
            import csv
            import io
            from database import db
            from registration_service import registration_service

            schools_data = []

            # 1. Primary High-Speed Direct Google Sheet CSV Fetch (~500ms, no script quotas)
            try:
                sheet_csv_url = "https://docs.google.com/spreadsheets/d/1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk/gviz/tq?tqx=out:csv&sheet=Agrash%20Registrations"
                req = urllib.request.Request(sheet_csv_url, headers={"User-Agent": "Mozilla/5.0 (AgrashPortal/2.0)"})
                with urllib.request.urlopen(req, timeout=8) as resp:
                    if resp.status == 200:
                        content = resp.read().decode("utf-8")
                        reader = csv.reader(io.StringIO(content))
                        rows = list(reader)
                        for r in rows[2:]:  # Skip headers and count summary row
                            if len(r) > 0 and r[0].strip() and not r[0].strip().isdigit():
                                sch_name = r[0].strip()
                                d_tag = r[2].strip() if len(r) > 2 and (r[1].strip().upper() == "YES" or r[2].strip().startswith("D-")) else ""
                                s_tag = r[4].strip() if len(r) > 4 and (r[3].strip().upper() == "YES" or r[4].strip().startswith("S-")) else ""
                                dec_tag = r[6].strip() if len(r) > 6 and (r[5].strip().upper() == "YES" or r[6].strip().startswith("DC-")) else ""
                                sci_tag = r[8].strip() if len(r) > 8 and (r[7].strip().upper() == "YES" or r[8].strip().startswith("SE-")) else ""
                                room = r[9].strip() if len(r) > 9 and r[9].strip() else "TBD"

                                schools_data.append({
                                    "school_name": sch_name,
                                    "dance_tag": d_tag,
                                    "song_tag": s_tag,
                                    "declamation_tag": dec_tag,
                                    "science_tag": sci_tag,
                                    "room_no": room
                                })
            except Exception as e_csv:
                logger.warning(f"Direct G-Sheet CSV fetch notice: {e_csv}. Trying Apps Script webhook fallback.")

            # 2. Webhook Fallback if direct CSV returned no rows
            if not schools_data:
                events = db.get_events()
                webhook = webhook_url or os.environ.get("GOOGLE_SHEET_WEBHOOK_URL") or (events[0].get("google_sheet_webhook_url") if events else None)
                if webhook and webhook.startswith("http"):
                    import requests
                    url = f"{webhook}?action=get_registrations"
                    resp = requests.get(url, timeout=12, allow_redirects=True)
                    if resp.status_code == 200:
                        data = resp.json()
                        schools_data = data.get("schools", [])

            if schools_data:
                updated_count = 0
                for s in schools_data:
                    rec = registration_service.upsert_school(
                        school_name=s.get("school_name", ""),
                        dance_tag=s.get("dance_tag", ""),
                        song_tag=s.get("song_tag", ""),
                        declamation_tag=s.get("declamation_tag", ""),
                        science_tag=s.get("science_tag", ""),
                        room_no=s.get("room_no", "TBD"),
                        desk_no=s.get("desk_no")
                    )
                    if rec:
                        updated_count += 1
                try:
                    self.pull_attendance_from_sheet()
                    db.sync_event_sequence_from_attendance()
                except Exception:
                    pass
                return True, f"Successfully synced {updated_count} schools from 'Agrash Registrations' sheet"
            return False, "No schools returned from 'Agrash Registrations' sheet"
        except Exception as e:
            logger.error(f"Error pulling from Agrash Registrations sheet: {e}")
            return False, str(e)

    def pull_attendance_from_sheet(self, webhook_url=None):
        """Pulls live PRESENT / ABSENT attendance and arrival check-ins from Google Sheet 'Attendance' tab and syncs event sequences"""
        try:
            import urllib.request
            import csv
            import io
            from database import db
            from registration_service import registration_service

            def parse_category_cell(cell_val):
                val = str(cell_val or "").strip()
                if not val or val == "-":
                    return None, "PENDING"
                status = "PENDING"
                val_upper = val.upper()
                if "PRESENT" in val_upper:
                    status = "PRESENT"
                elif "ABSENT" in val_upper:
                    status = "ABSENT"
                tag = val.split("(")[0].strip()
                if tag.upper() in ["PRESENT", "ABSENT", "PENDING", "-"]:
                    tag = ""
                return tag, status

            sheet_csv_url = "https://docs.google.com/spreadsheets/d/1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk/gviz/tq?tqx=out:csv&sheet=Attendance"
            req = urllib.request.Request(sheet_csv_url, headers={"User-Agent": "Mozilla/5.0 (AgrashPortal/2.0)"})
            rows = []
            try:
                with urllib.request.urlopen(req, timeout=8) as resp:
                    if resp.status == 200:
                        content = resp.read().decode("utf-8")
                        reader = csv.reader(io.StringIO(content))
                        rows = list(reader)
            except Exception as e_csv:
                logger.warning(f"Direct Attendance CSV fetch notice: {e_csv}")

            if not rows:
                return False, "Could not fetch Attendance sheet"

            data = registration_service.get_all()
            sch_map = {s["school_name"].strip().lower(): s for s in data}

            updated_schools = 0
            for r in rows[1:]:
                if len(r) < 8:
                    continue
                sch_name = r[1].strip()
                matched = sch_map.get(sch_name.lower())
                if not matched:
                    for k, v in sch_map.items():
                        if sch_name.lower() in k or k in sch_name.lower():
                            matched = v
                            break
                if not matched:
                    continue

                cat_cols = [
                    ("Group Dance", r[4]),
                    ("Group Song", r[5]),
                    ("Declamation", r[6]),
                    ("Science Exhibition", r[7])
                ]
                for cat_name, cell_val in cat_cols:
                    tag, status = parse_category_cell(cell_val)
                    ev = next((e for e in matched.get("events", []) if e.get("category") == cat_name), None)
                    if ev:
                        ev["status"] = status
                        if status == "PRESENT" and not ev.get("marked_at"):
                            ev["marked_at"] = r[9].strip() if len(r) > 9 and r[9].strip() else get_ist_time_str()

                arr_val = r[8].strip() if len(r) > 8 else ""
                if "ARRIVED" in arr_val.upper() or any(e.get("status") == "PRESENT" for e in matched.get("events", [])):
                    matched["is_arrived"] = True
                    if not matched.get("arrived_at"):
                        matched["arrived_at"] = r[9].strip() if len(r) > 9 and r[9].strip() else get_ist_time_str()
                updated_schools += 1

            registration_service._save(data)
            db.sync_event_sequence_from_attendance()
            logger.info(f"⚡ [Attendance Sync] Updated attendance for {updated_schools} schools and refreshed event sequences.")
            return True, f"Successfully synced attendance for {updated_schools} schools"
        except Exception as e:
            logger.error(f"Error pulling from Attendance sheet: {e}")
            return False, str(e)

    def sync_all_events(self):
        """Syncs all 4 category sequences, results, championship, and attendance to Google Sheet"""
        try:
            from database import db
            events = db.get_events()
            results = {}
            for ev in events:
                ok_seq, msg_seq = self.sync_event_sequence(ev["id"])
                ok_res, msg_res = self.auto_sync_event(ev["id"])
                results[f"{ev['name']} Sequence"] = {"success": ok_seq, "message": msg_seq}
                results[f"{ev['name']} Result"] = {"success": ok_res, "message": msg_res}

            # Sync Championship & Attendance
            ok_champ, msg_champ = self.sync_final_championship()
            ok_att, msg_att = self.sync_master_registrations()
            results["Championship"] = {"success": ok_champ, "message": msg_champ}
            results["Attendance"] = {"success": ok_att, "message": msg_att}

            return True, results
        except Exception as e:
            logger.error(f"Error in sync_all_events: {e}")
            return False, str(e)

    def export_event_scores(self, event, scores, sheet_url_or_name=None):
        return self.auto_sync_event(event["id"])

sheets_service = SheetsService()
