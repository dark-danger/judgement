import os
import json
import logging
from datetime import datetime
import gspread
from google.oauth2.service_account import Credentials

logger = logging.getLogger("sheets_service")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

class SheetsService:
    def __init__(self, credentials_path="credentials.json"):
        self.credentials_path = credentials_path
        self.client = None

    def _get_client(self):
        if not os.path.exists(self.credentials_path):
            return None
        try:
            creds = Credentials.from_service_account_file(self.credentials_path, scopes=SCOPES)
            return gspread.authorize(creds)
        except Exception as e:
            logger.error(f"Error authorizing gspread: {e}")
            return None

    def export_event_scores(self, event, scores, sheet_url_or_name=None):
        """Exports the event leaderboard and matrix to a Google Sheet"""
        client = self._get_client()
        if not client:
            return False, "Google service account credentials.json not found"

        target = sheet_url_or_name or event.get("google_sheet_url")
        if not target:
            return False, "No Google Sheet URL or Name provided"

        try:
            if "docs.google.com/spreadsheets" in str(target):
                sheet = client.open_by_url(target)
            elif len(str(target)) > 25 and "/" not in str(target):
                try:
                    sheet = client.open_by_key(target)
                except Exception:
                    sheet = client.open(target)
            else:
                sheet = client.open(target)

            # Try to get or create worksheet
            tab_name = f"Scores-{event['name'][:20]}"
            try:
                worksheet = sheet.worksheet(tab_name)
                worksheet.clear()
            except Exception:
                worksheet = sheet.add_worksheet(title=tab_name, rows=100, cols=20)

            # Build Header: Tag No | Criteria 1..5 | Total Marks per Judge | Average Total | Rank
            headers = ["Tag No"]
            for j in event.get("judges", []):
                headers.append(f"{j['name']} Total")
            headers.extend(["Overall Average", "Total Judges Scored", "Last Updated"])

            rows = [headers]
            for item in event.get("sequence", []):
                tag_no = item["tag_no"]
                row = [tag_no]
                tag_scores = [s for s in scores if s.get("tag_no") == tag_no]
                
                judge_totals = []
                for j in event.get("judges", []):
                    j_score = next((s for s in tag_scores if s.get("judge_id") == j["id"]), None)
                    if j_score:
                        row.append(j_score["total"])
                        judge_totals.append(j_score["total"])
                    else:
                        row.append("Pending")

                if judge_totals:
                    avg = round(sum(judge_totals) / len(judge_totals), 2)
                    row.append(avg)
                else:
                    row.append("-")

                row.append(len(judge_totals))
                row.append(datetime.now().strftime("%I:%M %p"))
                rows.append(row)

            worksheet.update("A1", rows)
            return True, f"Successfully exported to sheet '{sheet.title}' -> tab '{tab_name}'"
        except Exception as e:
            logger.error(f"Error updating Google Sheet: {e}")
            return False, str(e)

    def import_tags_from_sheet(self, sheet_url_or_name, column_index=1):
        """Reads Tag Numbers from a column in a Google Sheet"""
        client = self._get_client()
        if not client:
            return False, "Google service account credentials.json not found", []

        try:
            if "docs.google.com/spreadsheets" in str(sheet_url_or_name):
                sheet = client.open_by_url(sheet_url_or_name)
            else:
                sheet = client.open(sheet_url_or_name)

            ws = sheet.get_worksheet(0)
            values = ws.col_values(column_index)
            # Filter out header
            tags = [v.strip() for v in values if v.strip() and not any(h in v.lower() for h in ["tag", "team", "id", "header", "sr"])]
            return True, f"Found {len(tags)} tags from sheet", tags
        except Exception as e:
            return False, str(e), []

sheets_service = SheetsService()
