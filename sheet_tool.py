#!/usr/bin/env python3
"""
🔥 AGRASH Google Sheet Integration Tool
======================================
Usage:
  1. Pull Team Tags from Google Sheet:
     python sheet_tool.py pull "<GOOGLE_SHEET_URL>"

  2. Push Judgement Results to Google Sheet:
     python sheet_tool.py push "<GOOGLE_SHEET_URL>"

  3. Quick Status Check:
     python sheet_tool.py status
"""

import sys
import os
import re
import csv
import io
import json
import urllib.request
from datetime import datetime
from database import db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(BASE_DIR, "credentials.json")

def extract_sheet_id(url_or_id):
    """Extracts spreadsheet ID from any Google Sheet URL or ID string"""
    if "docs.google.com/spreadsheets" in url_or_id:
        match = re.search(r"/d/([a-zA-Z0-9-_]+)", url_or_id)
        if match:
            return match.group(1)
    return url_or_id.strip()

def pull_from_google_sheet(sheet_url_or_id, event_id="evt-agrash", column_name_or_idx=None):
    """
    Pulls team tag numbers from Google Sheet.
    Works with public / shared Google Sheets automatically without requiring API keys,
    or falls back to service account if configured.
    """
    sheet_id = extract_sheet_id(sheet_url_or_id)
    print(f"\n📥 Pulling team tags from Google Sheet (ID: {sheet_id})...")

    tags_found = []

    # Method 1: Fetch via Google Sheet CSV Export (Works with any sheet shared as 'Anyone with link can view')
    csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    try:
        req = urllib.request.Request(csv_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            content = response.read().decode("utf-8")
            reader = csv.reader(io.StringIO(content))
            rows = list(reader)

            if rows:
                headers = [h.strip().lower() for h in rows[0]]
                # Find tag / team column index
                col_idx = 0
                for idx, h in enumerate(headers):
                    if any(k in h for k in ["tag", "team", "code", "id", "ticket", "number", "no"]):
                        col_idx = idx
                        break

                for row in rows[1:]:
                    if len(row) > col_idx:
                        val = row[col_idx].strip()
                        if val and val.lower() not in ["tag", "team name", "id", "none"]:
                            tags_found.append(val)
                print(f"✅ Successfully read {len(tags_found)} tags via Google Sheet Export URL.")
    except Exception as e:
        print(f"⚠️ Direct export failed ({e}). Attempting via Google Sheets API (gspread)...")

    # Method 2: Fallback to gspread / Service Account if direct CSV was restricted
    if not tags_found and os.path.exists(CREDENTIALS_FILE):
        try:
            import gspread
            from google.oauth2.service_account import Credentials
            creds = Credentials.from_service_account_file(
                CREDENTIALS_FILE,
                scopes=["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
            )
            client = gspread.authorize(creds)
            sheet = client.open_by_key(sheet_id)
            ws = sheet.get_worksheet(0)
            values = ws.col_values(1)
            tags_found = [v.strip() for v in values[1:] if v.strip()]
            print(f"✅ Successfully read {len(tags_found)} tags via gspread Service Account.")
        except Exception as e2:
            print(f"❌ Could not access sheet via gspread: {e2}")

    if not tags_found:
        print("\n❌ Error: Could not extract tags from the provided Google Sheet.")
        print("💡 Solution: Make sure the Google Sheet sharing permission is set to:")
        print("   'Anyone with the link can view' (Viewer access)")
        return False

    # Update Agrash Event Sequence in Database
    event = db.get_event(event_id)
    if not event:
        event = db.get_events()[0]
        event_id = event["id"]

    new_sequence = [{"tag_no": tag, "notes": f"Slot {i+1}"} for i, tag in enumerate(tags_found)]
    db.update_sequence(event_id, new_sequence, current_index=0)
    db.update_event(event_id, {"google_sheet_url": sheet_url_or_id, "completed_tags": []})

    print(f"\n🎉 Successfully loaded {len(new_sequence)} team tags into '{event['name']}' sequence queue!")
    print("📋 Imported Tags Preview:")
    for i, t in enumerate(tags_found[:8], start=1):
        print(f"   Slot #{i}: {t}")
    if len(tags_found) > 8:
        print(f"   ... and {len(tags_found) - 8} more tags")
    print(f"\n🌐 Open Sequence Controller: http://127.0.0.1:5005/sequence/{event_id}")
    return True


def push_to_google_sheet(sheet_url_or_id=None, event_id="evt-agrash"):
    """
    Exports full judgement results to Google Sheet, and saves a local CSV backup.
    """
    event = db.get_event(event_id)
    if not event:
        event = db.get_events()[0]
        event_id = event["id"]

    scores = db.get_scores(event_id=event_id)
    judges = event.get("judges", [])
    
    # Combined sequence and completed tags
    all_tags = [item["tag_no"] for item in event.get("sequence", [])]
    for c in event.get("completed_tags", []):
        if c["tag_no"] not in all_tags:
            all_tags.append(c["tag_no"])

    # Build Header: Rank | Tag No | Judge 1..N | Overall Average (/100) | Status
    headers = ["Rank", "Tag No"]
    for j in judges:
        headers.append(f"{j['name']} (/100)")
    headers.extend(["Overall Average (/100)", "Judges Scored", "Status", "Timestamp"])

    # Calculate rows & ranks
    rows_data = []
    for tag_no in all_tags:
        tag_scores = [s for s in scores if s.get("tag_no") == tag_no]
        is_completed = any(c.get("tag_no") == tag_no for c in event.get("completed_tags", []))
        is_live = (event.get("sequence") and event["current_index"] < len(event["sequence"]) and event["sequence"][event["current_index"]]["tag_no"] == tag_no)
        
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
            "judge_cols": row_judge_cols,
            "avg": avg,
            "scored_count": len(j_totals),
            "status": status,
            "timestamp": datetime.now().strftime("%I:%M %p")
        })

    # Sort by highest average for rank calculation
    sorted_rows = sorted(rows_data, key=lambda x: x["avg"], reverse=True)
    for idx, r in enumerate(sorted_rows, start=1):
        r["rank"] = f"#{idx}" if r["avg"] > 0 else "-"

    # Build final matrix rows
    matrix_rows = [headers]
    for r in sorted_rows:
        row = [r["rank"], r["tag_no"]] + r["judge_cols"] + [r["avg"] if r["avg"] > 0 else "-", f"{r['scored_count']}/{len(judges)}", r["status"], r["timestamp"]]
        matrix_rows.append(row)

    # Save local CSV backup file
    csv_file = os.path.join(BASE_DIR, f"agrash_judgement_results.csv")
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(matrix_rows)
    print(f"\n💾 Local CSV report generated: {csv_file}")

    # Push to Google Sheet if credentials or target URL provided
    target = sheet_url_or_id or event.get("google_sheet_url")
    if target and os.path.exists(CREDENTIALS_FILE):
        try:
            import gspread
            from google.oauth2.service_account import Credentials
            creds = Credentials.from_service_account_file(
                CREDENTIALS_FILE,
                scopes=["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
            )
            client = gspread.authorize(creds)
            sheet_id = extract_sheet_id(target)
            sheet = client.open_by_key(sheet_id)
            
            tab_name = "Agrash_Results"
            try:
                ws = sheet.worksheet(tab_name)
                ws.clear()
            except Exception:
                ws = sheet.add_worksheet(title=tab_name, rows=100, cols=20)

            ws.update("A1", matrix_rows)
            print(f"✅ Successfully wrote judgement scores to Google Sheet tab '{tab_name}'!")
            return True
        except Exception as e:
            print(f"⚠️ Could not push directly to Google Sheet API: {e}")
            print(f"💡 You can directly import or copy the generated CSV: '{csv_file}'")
    else:
        print(f"📄 CSV report is ready to be uploaded or opened in Google Sheets / Excel!")

    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()

    if cmd == "pull":
        if len(sys.argv) < 3:
            print("\n❌ Error: Please provide the Google Sheet URL.")
            print("👉 Example: python sheet_tool.py pull \"https://docs.google.com/spreadsheets/d/your-sheet-id/edit\"")
            sys.exit(1)
        url = sys.argv[2]
        pull_from_google_sheet(url)

    elif cmd == "push":
        url = sys.argv[2] if len(sys.argv) > 2 else None
        push_to_google_sheet(url)

    elif cmd == "status":
        event = db.get_event("evt-agrash")
        scores = db.get_scores("evt-agrash")
        print(f"\n📊 Event: {event['name']}")
        print(f"   • Active in Queue: {len(event.get('sequence', []))} tags")
        print(f"   • Completed:       {len(event.get('completed_tags', []))} tags")
        print(f"   • Total Scores:    {len(scores)} submitted")
    else:
        print(__doc__)
