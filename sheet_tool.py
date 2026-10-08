#!/usr/bin/env python3
"""
🔥 AGRASH Google Sheet Integration Tool (Multi-Category Inter-School Event Parser)
================================================================================
Supports Multi-Category Event Sheets like:
  - School Name | Group Dance (YES | Tags) | Group Song (YES | Tags) | Declamation (YES | Tags) | Science Exhibition (YES | Tags) | Green Room

Usage:
  1. Pull Teams / Tags from Google Sheet:
     python sheet_tool.py pull "<GOOGLE_SHEET_URL>" [optional_category_name]

     Examples:
       python sheet_tool.py pull "https://docs.google.com/spreadsheets/d/..."
       python sheet_tool.py pull "https://docs.google.com/spreadsheets/d/..." "Group Dance"
       python sheet_tool.py pull "https://docs.google.com/spreadsheets/d/..." "Group Song"

  2. Push Judgement Results to Google Sheet / CSV:
     python sheet_tool.py push [optional_sheet_url]

  3. Show Status:
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
    if "docs.google.com/spreadsheets" in url_or_id:
        match = re.search(r"/d/([a-zA-Z0-9-_]+)", url_or_id)
        if match:
            return match.group(1)
    return url_or_id.strip()

def parse_multi_category_rows(rows, target_category=None):
    """
    Parses multi-category Google Sheet format:
    Row 0/1 headers: School Name | Group Dance | Tags | Group Song | Tags | Declamation | Tags | Science Exhibition | Tags | Green Room
    """
    if not rows or len(rows) < 2:
        return []

    # Find the header row (typically row 0 or row 1)
    header_row_idx = 0
    for idx, r in enumerate(rows[:3]):
        row_str = " ".join(r).lower()
        if "school" in row_str or "dance" in row_str or "song" in row_str or "tags" in row_str:
            header_row_idx = idx
            break

    headers = rows[header_row_idx]
    
    # Identify Categories and their Tag columns
    # Example headers: [School Name, Group Dance, Tags, Group Song, Tags, Declamation, Tags, Science Exhibition, Tags, Green Room Allocation]
    categories = [] # [{ name: 'Group Dance', status_col: 1, tag_col: 2 }, ...]
    school_col = 0
    green_room_col = -1

    for idx, h in enumerate(headers):
        h_clean = h.strip()
        h_lower = h_clean.lower()
        if "school" in h_lower:
            school_col = idx
        elif "green room" in h_lower:
            green_room_col = idx
        elif h_clean and h_lower != "tags" and idx + 1 < len(headers) and "tag" in headers[idx + 1].lower():
            categories.append({
                "name": h_clean,
                "status_col": idx,
                "tag_col": idx + 1
            })
        elif "tag" in h_lower and idx > 0 and headers[idx - 1].strip() and not any(c["tag_col"] == idx for c in categories):
            prev_cat = headers[idx - 1].strip()
            categories.append({
                "name": prev_cat,
                "status_col": idx - 1,
                "tag_col": idx
            })

    # If no structured pairs found, fallback to scanning any column containing 'tag'
    if not categories:
        for idx, h in enumerate(headers):
            if "tag" in h.lower():
                categories.append({
                    "name": "General Event",
                    "status_col": -1,
                    "tag_col": idx
                })

    print(f"🔍 Detected {len(categories)} Event Categories in Sheet:")
    for cat in categories:
        print(f"   • Category: '{cat['name']}' (Tag Column index: {cat['tag_col']})")

    # Filter by target category if specified
    if target_category:
        categories = [c for c in categories if target_category.lower() in c["name"].lower()]
        print(f"🎯 Filtered for specific category: '{target_category}'")

    parsed_items = []
    # Start parsing data rows (skip header row and count row if any)
    data_rows = rows[header_row_idx + 1:]
    # If the first data row is a count row (like '58, 43, , 27...'), skip it
    if data_rows and any(r and r[0].strip().isdigit() for r in data_rows[:1]):
        data_rows = data_rows[1:]

    for r in data_rows:
        if not r or not any(r):
            continue
        school_name = r[school_col].strip() if len(r) > school_col else "School"
        # Skip summary/empty rows
        if not school_name or school_name.isdigit():
            continue

        green_room = r[green_room_col].strip() if (green_room_col >= 0 and len(r) > green_room_col) else ""

        for cat in categories:
            tag_val = r[cat["tag_col"]].strip() if len(r) > cat["tag_col"] else ""
            status_val = r[cat["status_col"]].strip().upper() if (cat["status_col"] >= 0 and len(r) > cat["status_col"]) else ""

            # Check if participant has tag or YES
            if tag_val:
                parsed_items.append({
                    "tag_no": tag_val,
                    "school_name": school_name,
                    "category": cat["name"],
                    "green_room": green_room,
                    "status": "In Queue"
                })

    return parsed_items, categories


def pull_from_google_sheet(sheet_url_or_id, target_category=None, event_id="evt-agrash"):
    sheet_id = extract_sheet_id(sheet_url_or_id)
    print(f"\n📥 Fetching data from Google Sheet (ID: {sheet_id})...")

    raw_rows = []

    # 1. Direct CSV export download
    csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    try:
        req = urllib.request.Request(csv_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            content = response.read().decode("utf-8")
            reader = csv.reader(io.StringIO(content))
            raw_rows = list(reader)
    except Exception as e:
        print(f"⚠️ Direct export failed ({e}). Trying Service Account...")

    # 2. Fallback to gspread
    if not raw_rows and os.path.exists(CREDENTIALS_FILE):
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
            raw_rows = ws.get_all_values()
        except Exception as e2:
            print(f"❌ gspread access error: {e2}")

    if not raw_rows:
        print("\n❌ Error: Could not download sheet. Please ensure sharing permission is 'Anyone with the link can view'.")
        return False

    parsed_items, categories = parse_multi_category_rows(raw_rows, target_category)

    if not parsed_items:
        print("❌ No tags found in sheet rows.")
        return False

    # Update Agrash Sequence Queue
    event = db.get_event(event_id)
    if not event:
        event = db.get_events()[0]
        event_id = event["id"]

    new_sequence = []
    for item in parsed_items:
        new_sequence.append({
            "tag_no": item["tag_no"],
            "notes": f"{item['category']} • {item['school_name']}" + (f" (Room: {item['green_room']})" if item['green_room'] else "")
        })

    db.update_sequence(event_id, new_sequence, current_index=0)
    db.update_event(event_id, {
        "google_sheet_url": sheet_url_or_id,
        "completed_tags": [],
        "description": f"Agrash Inter-School Event • {len(categories)} Categories • {len(new_sequence)} Total Performances"
    })

    print(f"\n🎉 Successfully loaded {len(new_sequence)} team tags into Agrash Judgement Portal!")
    print("\n📋 Sample Loaded Tag Sequence:")
    for i, item in enumerate(new_sequence[:10], start=1):
        print(f"   Slot #{i:02d} | 🏷️  {item['tag_no']:<8} | {item['notes']}")
    if len(new_sequence) > 10:
        print(f"   ... and {len(new_sequence) - 10} more performance tags in queue.")

    print(f"\n🌐 Live Judge Portal:       http://127.0.0.1:5005/judge/{event_id}")
    print(f"🔄 Live Sequence Manager:   http://127.0.0.1:5005/sequence/{event_id}")
    print(f"👑 Super Admin Dashboard:   http://127.0.0.1:5005/admin")
    return True


def push_to_google_sheet(sheet_url_or_id=None, event_id="evt-agrash"):
    event = db.get_event(event_id)
    if not event:
        event = db.get_events()[0]
        event_id = event["id"]

    scores = db.get_scores(event_id=event_id)
    judges = event.get("judges", [])
    
    # Combined sequence and completed tags
    all_tags = []
    tag_meta = {}

    for item in event.get("sequence", []):
        all_tags.append(item["tag_no"])
        tag_meta[item["tag_no"]] = item.get("notes", "")

    for c in event.get("completed_tags", []):
        if c["tag_no"] not in all_tags:
            all_tags.append(c["tag_no"])
            tag_meta[c["tag_no"]] = c.get("notes", "")

    headers = ["Rank", "Tag No", "Event / School Details"]
    for j in judges:
        headers.append(f"{j['name']} (/100)")
    headers.extend(["Overall Average (/100)", "Judges Scored", "Status", "Timestamp"])

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
            "details": tag_meta.get(tag_no, ""),
            "judge_cols": row_judge_cols,
            "avg": avg,
            "scored_count": len(j_totals),
            "status": status,
            "timestamp": datetime.now().strftime("%I:%M %p")
        })

    sorted_rows = sorted(rows_data, key=lambda x: x["avg"], reverse=True)
    for idx, r in enumerate(sorted_rows, start=1):
        r["rank"] = f"#{idx}" if r["avg"] > 0 else "-"

    matrix_rows = [headers]
    for r in sorted_rows:
        row = [r["rank"], r["tag_no"], r["details"]] + r["judge_cols"] + [r["avg"] if r["avg"] > 0 else "-", f"{r['scored_count']}/{len(judges)}", r["status"], r["timestamp"]]
        matrix_rows.append(row)

    csv_file = os.path.join(BASE_DIR, f"agrash_judgement_results.csv")
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(matrix_rows)
    print(f"\n💾 Local CSV report generated: {csv_file}")

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
            print(f"✅ Successfully exported marksheet to Google Sheet tab '{tab_name}'!")
        except Exception as e:
            print(f"⚠️ Direct Google Sheets API update: {e}")
    else:
        print(f"📄 Full Marksheet CSV is ready to paste into Google Sheets / Excel!")

    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()
    if cmd == "pull":
        if len(sys.argv) < 3:
            print("\n❌ Error: Please provide the Google Sheet URL.")
            print("👉 Example: python sheet_tool.py pull \"https://docs.google.com/spreadsheets/d/...\"")
            sys.exit(1)
        url = sys.argv[2]
        cat = sys.argv[3] if len(sys.argv) > 3 else None
        pull_from_google_sheet(url, target_category=cat)
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
