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
        """Spawns non-blocking background thread to update connected Google Sheet"""
        thread = threading.Thread(target=self.auto_sync_event, args=(event_id,), daemon=True)
        thread.start()

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
                payload = json.dumps({
                    "event_name": event["name"],
                    "tab_name": f"Live Scores",
                    "rows": final_table_rows,
                    "timestamp": datetime.now().isoformat()
                }).encode("utf-8")
                
                req = urllib.request.Request(
                    webhook_url,
                    data=payload,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=5) as response:
                    logger.info(f"⚡ [Google Sheet Webhook] Auto-updated successfully!")
                    return True, "Auto-updated via Webhook"

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
