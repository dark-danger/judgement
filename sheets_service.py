import os
import json
import logging
import threading
import urllib.request
from datetime import datetime

logger = logging.getLogger("sheets_service")

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

            # Check environment variable for JSON string (ideal for Vercel)
            sa_json_env = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
            if sa_json_env:
                try:
                    info = json.loads(sa_json_env)
                    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
                    return gspread.authorize(creds)
                except Exception as e:
                    logger.error(f"Error loading GOOGLE_SERVICE_ACCOUNT_JSON env: {e}")

            # Check local file
            if os.path.exists(self.credentials_path):
                creds = Credentials.from_service_account_file(self.credentials_path, scopes=SCOPES)
                return gspread.authorize(creds)
        except Exception as e:
            logger.error(f"Error authorizing gspread: {e}")
        return None

    def trigger_background_sync(self, event_id):
        """Spawns non-blocking background thread to update connected Google Sheet and Final Result tab"""
        def _sync_worker():
            self.auto_sync_event(event_id)
            self.sync_final_championship()

        thread = threading.Thread(target=_sync_worker, daemon=True)
        thread.start()

    def calculate_championship_data(self):
        """Calculates 4-event combined score leaderboard across all 58 schools"""
        try:
            from create_excel import schools_data
            from database import db

            all_scores = db.get_scores()

            def get_tag_avg(event_id, tag_no):
                if not tag_no:
                    return None, "-"
                tag_scores = [s for s in all_scores if s.get("event_id") == event_id and s.get("tag_no") == tag_no]
                if not tag_scores:
                    return 0, f"{tag_no} (Pending)"
                totals = [s.get("total", 0) for s in tag_scores]
                avg = round(sum(totals) / len(totals), 2)
                return avg, f"{tag_no} ({avg})"

            results = []
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
                    "song": s_str,
                    "song_score": s_avg or 0,
                    "declamation": dc_str,
                    "declamation_score": dc_avg or 0,
                    "science": se_str,
                    "science_score": se_avg or 0,
                    "total_score": total_score,
                    "overall_avg": overall_avg,
                    "events_done": events_done
                })

            results.sort(key=lambda x: (x["total_score"], x["overall_avg"]), reverse=True)
            return results
        except Exception as e:
            logger.error(f"Error calculating championship data: {e}")
            return []

    def sync_final_championship(self, webhook_url=None):
        """Pushes the combined 4-event Top 10 Championship results to Google Sheet 'Final Result' tab"""
        try:
            from database import db
            championship_list = self.calculate_championship_data()
            if not championship_list:
                return False, "No data available"

            events = db.get_events()
            webhook = webhook_url
            if not webhook and events:
                webhook = events[0].get("google_sheet_webhook_url") or os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")

            headers = [
                "Rank",
                "School Name",
                "Room / Flat",
                "Group Dance (/100)",
                "Group Song (/100)",
                "Declamation (/100)",
                "Science Exhibition (/100)",
                "Combined Total (/400)",
                "Combined Average (/100)",
                "Events Scored",
                "Standing / Award",
                "Last Updated"
            ]

            final_rows = [headers]
            for idx, r in enumerate(championship_list, start=1):
                if idx == 1 and r["total_score"] > 0:
                    standing = "🏆 1st Place - Champion (Gold)"
                elif idx == 2 and r["total_score"] > 0:
                    standing = "🥈 2nd Place - 1st Runner Up (Silver)"
                elif idx == 3 and r["total_score"] > 0:
                    standing = "🥉 3rd Place - 2nd Runner Up (Bronze)"
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
                    r["overall_avg"] if r["overall_avg"] > 0 else "-",
                    f"{r['events_done']}/4",
                    standing,
                    datetime.now().strftime("%I:%M %p")
                ]
                final_rows.append(row)

            if webhook and webhook.startswith("http"):
                import requests
                resp = requests.post(
                    webhook,
                    json={
                        "event_name": "Agrash Overall Championship",
                        "tab_name": "Final Result",
                        "rows": final_rows,
                        "timestamp": datetime.now().isoformat()
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=25,
                    allow_redirects=True
                )
                logger.info(f"⚡ [Final Result Webhook] Synced successfully! Status: {resp.status_code}")
                return True, "Final Result tab synced successfully"

            return False, "No webhook configured"
        except Exception as e:
            logger.error(f"Error syncing final championship: {e}")
            return False, str(e)

    CATEGORY_TAB_MAP = {
        "group dance": "registration_dance",
        "group song": "registration_song",
        "declamation": "registration_declamation",
        "science exhibition": "registration_science"
    }

    def trigger_registration_sync(self, category=None):
        """Spawns background thread to update specific or all 4 registration sheets in Google Sheet"""
        def _worker():
            if category:
                self.sync_category_registration(category)
            else:
                self.sync_all_registration_sheets()
        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

    def sync_category_registration(self, category_name, webhook_url=None):
        """Pushes single category registration & attendance sheet (e.g. registration_dance) to Google Sheet"""
        try:
            from registration_service import registration_service
            from database import db

            tab_name = self.CATEGORY_TAB_MAP.get(category_name.lower().strip(), f"registration_{category_name.lower()[:5]}")
            schools = registration_service.get_all()
            
            headers = [
                "S.No",
                "Tag No",
                "School Name",
                "Assigned Desk",
                "Room / Flat",
                "Attendance Status",
                "Check-In Time",
                "Last Updated"
            ]

            rows = [headers]
            count = 1
            for s in schools:
                ev = next((e for e in s.get("events", []) if e.get("category").lower() == category_name.lower()), None)
                if ev:
                    st = ev.get("status", "PENDING")
                    if st == "PRESENT":
                        st_display = "PRESENT (✅)"
                    elif st == "ABSENT":
                        st_display = "ABSENT (❌)"
                    else:
                        st_display = "PENDING (⏳)"

                    row = [
                        f"#{count}",
                        ev.get("tag_no", ""),
                        s["school_name"],
                        f"Desk {s['desk_no']}",
                        s.get("room_no", "-"),
                        st_display,
                        ev.get("marked_at") or "-",
                        datetime.now().strftime("%I:%M %p")
                    ]
                    rows.append(row)
                    count += 1

            events = db.get_events()
            webhook = webhook_url
            if not webhook and events:
                webhook = events[0].get("google_sheet_webhook_url") or os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")

            if webhook and webhook.startswith("http"):
                import requests
                resp = requests.post(
                    webhook,
                    json={
                        "event_name": f"Registration {category_name}",
                        "tab_name": tab_name,
                        "rows": rows,
                        "timestamp": datetime.now().isoformat()
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=25,
                    allow_redirects=True
                )
                logger.info(f"⚡ [{tab_name} Webhook] Synced successfully! Status: {resp.status_code}")
                return True, f"{tab_name} synced successfully"

            return False, "No webhook configured"
        except Exception as e:
            logger.error(f"Error syncing category registration: {e}")
            return False, str(e)

    def sync_all_registration_sheets(self, webhook_url=None):
        """Pushes all 4 separate registration tabs (dance, song, declamation, science) to Google Sheet"""
        cats = ["Group Dance", "Group Song", "Declamation", "Science Exhibition"]
        res = {}
        for c in cats:
            ok, msg = self.sync_category_registration(c, webhook_url=webhook_url)
            res[c] = {"success": ok, "message": msg}
        return True, res

    def sync_all_events(self):
        """Syncs all registered evaluation events, Final Result, and 4 Registration tabs to Google Sheet"""
        try:
            from database import db
            events = db.get_events()
            results = {}
            for ev in events:
                ok, msg = self.auto_sync_event(ev["id"])
                results[ev["name"]] = {"success": ok, "message": msg}

            # Sync Final Combined Result
            ok_fin, msg_fin = self.sync_final_championship()
            results["Final Result"] = {"success": ok_fin, "message": msg_fin}

            # Sync 4 Registration sheets
            ok_regs, res_regs = self.sync_all_registration_sheets()
            results["Registrations"] = res_regs

            return True, results
        except Exception as e:
            logger.error(f"Error in sync_all_events: {e}")
            return False, str(e)



    def auto_sync_event(self, event_id):
        """Automatically pushes live leaderboard and marksheet to connected Google Sheet"""
        try:
            from database import db
            event = db.get_event(event_id)
            if not event:
                return False, "Event not found"

            scores = db.get_scores(event_id=event["id"])
            judges = event.get("judges", [])
            
            all_tags = []
            tag_meta = {}

            for item in event.get("sequence", []):
                all_tags.append(item["tag_no"])
                tag_meta[item["tag_no"]] = item.get("notes", "")

            for c in event.get("completed_tags", []):
                if c["tag_no"] not in all_tags:
                    all_tags.append(c["tag_no"])
                    tag_meta[c["tag_no"]] = c.get("notes", "")

            headers = ["Rank", "Tag No", "School & Category"]
            for j in judges:
                headers.append(f"{j['name']} (/100)")
            headers.extend(["Overall Average (/100)", "Judges Scored", "Status", "Last Updated"])

            rows_data = []
            for tag_no in all_tags:
                tag_scores = [s for s in scores if s.get("tag_no") == tag_no]
                is_completed = any(c.get("tag_no") == tag_no for c in event.get("completed_tags", []))
                is_live = (event.get("sequence") and event["sequence"][0]["tag_no"] == tag_no)
                
                status = "COMPLETED" if is_completed else ("LIVE ON STAGE" if is_live else "IN QUEUE")

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
                    "judge_scores": row_judge_cols,
                    "avg": avg,
                    "count": len(j_totals),
                    "status": status
                })

            # Sort by highest average
            scored_rows = [r for r in rows_data if r["count"] > 0]
            unscored_rows = [r for r in rows_data if r["count"] == 0]
            scored_rows.sort(key=lambda x: x["avg"], reverse=True)
            
            final_table_rows = [headers]
            for idx, r in enumerate(scored_rows, start=1):
                row = [f"#{idx}", r["tag_no"], r["details"]]
                row.extend(r["judge_scores"])
                row.extend([r["avg"], f"{r['count']}/{len(judges)}", r["status"], datetime.now().strftime("%I:%M %p")])
                final_table_rows.append(row)

            for r in unscored_rows:
                row = ["-", r["tag_no"], r["details"]]
                row.extend(r["judge_scores"])
                row.extend(["-", f"0/{len(judges)}", r["status"], datetime.now().strftime("%I:%M %p")])
                final_table_rows.append(row)

            # Check 1: Google Apps Script Webhook URL (Instant 0-auth sync)
            webhook_url = event.get("google_sheet_webhook_url") or os.environ.get("GOOGLE_SHEET_WEBHOOK_URL")
            if webhook_url and webhook_url.startswith("http"):
                try:
                    import requests
                    resp = requests.post(
                        webhook_url,
                        json={
                            "event_name": event["name"],
                            "tab_name": event.get("name", "Live Scores"),
                            "rows": final_table_rows,
                            "timestamp": datetime.now().isoformat()
                        },
                        headers={"Content-Type": "application/json"},
                        timeout=25,
                        allow_redirects=True
                    )
                    logger.info(f"⚡ [Google Sheet Webhook] Auto-updated successfully! Status: {resp.status_code}")
                    return True, "Auto-updated via Webhook"
                except Exception as ex:
                    logger.error(f"Webhook request failed: {ex}")

            # Check 2: Service account connection
            client = self._get_client()
            target_sheet = event.get("google_sheet_url") or os.environ.get("GOOGLE_SHEET_URL")
            if client and target_sheet:
                if "docs.google.com/spreadsheets" in str(target_sheet):
                    sheet = client.open_by_url(target_sheet)
                else:
                    sheet = client.open_by_key(target_sheet)

                tab_name = "Live Scores"
                try:
                    worksheet = sheet.worksheet(tab_name)
                    worksheet.clear()
                except Exception:
                    worksheet = sheet.add_worksheet(title=tab_name, rows=len(final_table_rows) + 20, cols=20)

                worksheet.update("A1", final_table_rows)
                logger.info(f"⚡ [Google Sheet Service Account] Auto-updated '{sheet.title}'!")
                return True, "Auto-updated via Service Account"

            return False, "No Google Sheet Webhook or Service Account configured"
        except Exception as e:
            logger.error(f"Auto-sync error: {e}")
            return False, str(e)

    def export_event_scores(self, event, scores, sheet_url_or_name=None):
        return self.auto_sync_event(event["id"])

    def import_tags_from_sheet(self, sheet_url_or_name, column_index=1):
        client = self._get_client()
        if not client:
            return False, "Google service account not configured", []
        try:
            sheet = client.open_by_url(sheet_url_or_name) if "http" in sheet_url_or_name else client.open(sheet_url_or_name)
            ws = sheet.get_worksheet(0)
            col_vals = ws.col_values(column_index)
            tags = [v.strip() for v in col_vals if v.strip() and v.strip().lower() != "tags"]
            return True, f"Found {len(tags)} tags", tags
        except Exception as e:
            return False, str(e), []

sheets_service = SheetsService()
