import os
import io
import csv
import json
import time
import socket
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from database import db
from sheets_service import sheets_service

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

# --- Web Page Routes ---

@app.route("/")
def index_page():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/admin")
def admin_page():
    return send_from_directory(app.static_folder, "admin.html")

@app.route("/judge")
@app.route("/judges")
@app.route("/judge/<event_id>")
def judge_page(event_id=None):
    return send_from_directory(app.static_folder, "judge.html")

@app.route("/sequence")
@app.route("/sequence/<event_id>")
def sequence_page(event_id=None):
    return send_from_directory(app.static_folder, "sequence.html")

@app.route("/projector")
@app.route("/projector/<event_id>")
def projector_page(event_id=None):
    return send_from_directory(app.static_folder, "projector.html")

@app.route("/registration")
@app.route("/registration/<desk_id>")
@app.route("/desk/<desk_id>")
def registration_page(desk_id=None):
    return send_from_directory(app.static_folder, "registration.html")

# Static assets fallback
@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

# --- Registration API Endpoints ---
@app.route("/api/registration", methods=["GET"])
def get_registrations_api():
    try:
        from registration_service import registration_service
        desk_no = request.args.get("desk")
        query = request.args.get("q", "")
        data = registration_service.get_all(desk_no=desk_no, query=query)
        return jsonify({"success": True, "schools": data, "count": len(data)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/registration/stats", methods=["GET"])
def get_registration_stats_api():
    try:
        from registration_service import registration_service
        stats = registration_service.get_stats()
        return jsonify({"success": True, "stats": stats})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/registration/attendance", methods=["POST"])
def update_attendance_api():
    try:
        from registration_service import registration_service
        data = request.get_json(silent=True) or {}
        school_id = data.get("school_id")
        category = data.get("category")
        tag_no = data.get("tag_no")
        status = data.get("status", "PRESENT")
        mark_all = data.get("mark_all", False)

        if not school_id:
            return jsonify({"success": False, "error": "School ID is required"}), 400

        updated = registration_service.mark_attendance(
            school_id=school_id,
            category=category,
            tag_no=tag_no,
            status=status,
            mark_all=mark_all
        )
        if not updated:
            return jsonify({"success": False, "error": "School not found"}), 404

        return jsonify({"success": True, "school": updated})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/registration/sync-sheets", methods=["POST"])
def sync_registration_sheets_api():
    try:
        ok, msg = sheets_service.sync_master_registrations()
        return jsonify({"success": ok, "message": msg})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/network-info", methods=["GET"])
def get_network_info():
    local_ip = get_local_ip()
    port = int(os.environ.get("PORT", 5005))
    return jsonify({
        "success": True,
        "local_ip": local_ip,
        "port": port,
        "network_base_url": f"http://{local_ip}:{port}",
        "localhost_base_url": f"http://127.0.0.1:{port}"
    })

@app.route("/api/supabase/status", methods=["GET"])
def get_supabase_status():
    status = db.get_supabase_status()
    return jsonify({"success": True, **status})

@app.route("/api/supabase/config", methods=["POST"])
def configure_supabase():
    data = request.get_json() or {}
    url = data.get("url", "")
    key = data.get("key", "")
    if not url or not key:
        return jsonify({"success": False, "error": "Both Supabase Project URL and API Key are required"}), 400
    
    success, msg = db.configure_supabase(url, key)
    return jsonify({"success": success, "message": msg, **db.get_supabase_status()})

@app.route("/api/supabase/sync", methods=["POST"])
def sync_supabase():
    success, msg = db.sync_local_to_supabase()
    return jsonify({"success": success, "message": msg})

@app.route("/api/events", methods=["GET"])
def get_all_events():
    events = db.get_events()
    return jsonify({"success": True, "events": events})

@app.route("/api/events/<event_id>", methods=["GET"])
def get_single_event(event_id):
    event = db.get_event(event_id)
    if not event:
        return jsonify({"success": False, "error": "Event not found"}), 404
    
    seq = event.get("sequence", [])
    current_tag = seq[0]["tag_no"] if len(seq) > 0 else None
    next_tag = seq[1]["tag_no"] if len(seq) > 1 else None

    remaining_secs = 0
    if event.get("next_transition_time"):
        remaining_secs = max(0, int(event["next_transition_time"] - time.time()))

    return jsonify({
        "success": True,
        "event": event,
        "current_tag": current_tag,
        "next_tag": next_tag,
        "current_index": 0,
        "completed_tags": event.get("completed_tags", []),
        "remaining_transition_seconds": remaining_secs
    })

@app.route("/api/events", methods=["POST"])
def create_event():
    data = request.get_json() or {}
    name = data.get("name")
    description = data.get("description", "")
    judge_names = data.get("judge_names", [])
    tag_numbers = data.get("tag_numbers", [])
    google_sheet_url = data.get("google_sheet_url", "")

    if not name:
        return jsonify({"success": False, "error": "Event name is required"}), 400
    
    if len(judge_names) < 2 or len(judge_names) > 10:
        return jsonify({"success": False, "error": "Please provide between 2 and 10 judges"}), 400

    if not tag_numbers:
        return jsonify({"success": False, "error": "Please provide at least 1 team tag number"}), 400

    event = db.create_event(
        name=name,
        description=description,
        judge_names=judge_names,
        tag_numbers=tag_numbers,
        google_sheet_url=google_sheet_url
    )

    return jsonify({
        "success": True,
        "event": event,
        "links": {
            "judge_portal": f"/judge/{event['id']}",
            "sequence_portal": f"/sequence/{event['id']}",
            "projector_portal": f"/projector/{event['id']}",
            "admin_portal": f"/admin"
        }
    })

@app.route("/api/events/<event_id>", methods=["PUT", "POST"])
def update_event(event_id):
    try:
        data = request.get_json(silent=True) or {}
        event = db.get_event(event_id)
        if not event:
            return jsonify({"success": False, "error": "Event not found"}), 404

        update_dict = {}
        if "name" in data and data["name"]:
            update_dict["name"] = data["name"].strip()
        if "description" in data:
            update_dict["description"] = data["description"].strip()

        # Dynamic Judge Management: Add, Remove, Rename
        if "judges" in data and isinstance(data["judges"], list):
            formatted_judges = []
            for idx, j in enumerate(data["judges"], start=1):
                if isinstance(j, dict):
                    j_id = j.get("id") or f"j{idx}"
                    j_name = j.get("name", f"Judge {idx}").strip()
                    if j_name:
                        formatted_judges.append({
                            "id": j_id,
                            "name": j_name,
                            "is_active": j.get("is_active", True)
                        })
                elif isinstance(j, str) and j.strip():
                    formatted_judges.append({
                        "id": f"j{idx}",
                        "name": j.strip(),
                        "is_active": True
                    })
            if formatted_judges:
                update_dict["judges"] = formatted_judges
                update_dict["judge_count"] = len(formatted_judges)

        if "criteria" in data and isinstance(data["criteria"], list):
            update_dict["criteria"] = data["criteria"]

        if "google_sheet_url" in data:
            update_dict["google_sheet_url"] = data["google_sheet_url"]
        if "google_sheet_webhook_url" in data:
            update_dict["google_sheet_webhook_url"] = data["google_sheet_webhook_url"]

        updated = db.update_event(event_id, update_dict)
        sheets_service.trigger_background_sync(event_id)
        return jsonify({"success": True, "event": updated})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/events/<event_id>/add-judge", methods=["POST"])
def add_judge_route(event_id):
    try:
        data = request.get_json(silent=True) or {}
        judge_name = data.get("name", "").strip() or "Judge"
        updated = db.add_judge(event_id, judge_name)
        if not updated:
            return jsonify({"success": False, "error": "Event not found"}), 404
        sheets_service.trigger_background_sync(event_id)
        return jsonify({"success": True, "event": updated})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/events/<event_id>/judges/<judge_id>", methods=["DELETE"])
def remove_judge_route(event_id, judge_id):
    try:
        updated = db.remove_judge(event_id, judge_id)
        if not updated:
            return jsonify({"success": False, "error": "Event not found"}), 404
        sheets_service.trigger_background_sync(event_id)
        return jsonify({"success": True, "event": updated})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/championship", methods=["GET"])
def get_championship_leaderboard():
    try:
        data = sheets_service.calculate_championship_data()
        return jsonify({
            "success": True,
            "championship": data,
            "top10": data[:10] if data else []
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/sync-all-sheets", methods=["POST"])
def sync_all_sheets_route():
    try:
        ok, res = sheets_service.sync_all_events()
        return jsonify({"success": ok, "details": res})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/events/<event_id>", methods=["DELETE"])
def delete_event(event_id):
    db.delete_event(event_id)
    return jsonify({"success": True, "message": "Event deleted successfully"})

@app.route("/api/events/<event_id>/sequence", methods=["POST"])
def update_sequence(event_id):
    try:
        data = request.get_json(silent=True) or {}
        new_sequence = data.get("sequence", [])
        current_index = data.get("current_index")

        if new_sequence is None:
            return jsonify({"success": False, "error": "Sequence is required"}), 400

        updated = db.update_sequence(event_id, new_sequence, current_index)
        if not updated:
            return jsonify({"success": False, "error": "Event not found"}), 404

        return jsonify({"success": True, "event": updated})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/events/<event_id>/current-tag", methods=["POST"])
def set_current_tag(event_id):
    try:
        data = request.get_json(silent=True) or {}
        target_index = data.get("index")

        if target_index is None:
            return jsonify({"success": False, "error": "Index required"}), 400

        updated = db.set_current_tag(event_id, int(target_index))
        if not updated:
            return jsonify({"success": False, "error": "Invalid index or event not found"}), 400

        return jsonify({"success": True, "event": updated})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/events/<event_id>/complete-tag", methods=["POST"])
def complete_tag(event_id):
    try:
        data = request.get_json(silent=True) or {}
        tag_index = data.get("index")
        tag_no = data.get("tag_no")

        updated, msg = db.complete_and_remove_tag(
            event_id=event_id,
            tag_index=int(tag_index) if tag_index is not None and str(tag_index).isdigit() else None,
            tag_no=tag_no
        )

        if not updated:
            return jsonify({"success": False, "error": msg}), 400

        return jsonify({"success": True, "message": msg, "event": updated})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/events/<event_id>/restore-tag", methods=["POST"])
def restore_tag(event_id):
    try:
        data = request.get_json(silent=True) or {}
        tag_no = data.get("tag_no")
        if not tag_no:
            return jsonify({"success": False, "error": "Tag Number required"}), 400

        updated = db.restore_completed_tag(event_id, tag_no)
        if not updated:
            return jsonify({"success": False, "error": "Could not restore tag"}), 400

        return jsonify({"success": True, "message": f"Tag '{tag_no}' restored to queue", "event": updated})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# Reset Demo Presentation Data Endpoint
@app.route("/api/events/<event_id>/reset-demo", methods=["POST"])
def reset_demo_data(event_id):
    db._init_defaults()
    return jsonify({"success": True, "message": "Agrash demo event reset to presentation state!"})

# Populate Sample Scores for Demo Endpoint
@app.route("/api/events/<event_id>/sample-scores", methods=["POST"])
def populate_sample_scores(event_id):
    event = db.get_event(event_id)
    if not event:
        return jsonify({"success": False, "error": "Event not found"}), 404

    import random
    judges = event.get("judges", [])
    all_tags = [item["tag_no"] for item in event.get("sequence", [])]
    for c in event.get("completed_tags", []):
        if c["tag_no"] not in all_tags:
            all_tags.append(c["tag_no"])

    for tag in all_tags[:5]:
        for j in judges:
            c_scores = {
                "c1": random.randint(15, 20),
                "c2": random.randint(14, 20),
                "c3": random.randint(16, 20),
                "c4": random.randint(15, 20),
                "c5": random.randint(14, 20)
            }
            db.submit_score(event_id, tag, j["id"], j["name"], c_scores, "Sample Presentation Evaluation")

    return jsonify({"success": True, "message": "Sample marks populated for top teams!"})

# --- Scoring Endpoints ---

@app.route("/api/events/<event_id>/scores", methods=["GET"])
def get_event_scores(event_id):
    scores = db.get_scores(event_id=event_id)
    event = db.get_event(event_id)
    return jsonify({"success": True, "scores": scores, "event": event})

@app.route("/api/events/<event_id>/scores", methods=["POST"])
def submit_score(event_id):
    data = request.get_json() or {}
    tag_no = data.get("tag_no")
    judge_id = data.get("judge_id")
    judge_name = data.get("judge_name", "")
    criteria_scores = data.get("scores", {})
    remarks = data.get("remarks", "")

    if not tag_no or not judge_id:
        return jsonify({"success": False, "error": "Missing tag_no or judge_id"}), 400

    for k, v in criteria_scores.items():
        try:
            val = float(v)
            if val < 0 or val > 20:
                return jsonify({"success": False, "error": f"Score for {k} must be between 0 and 20"}), 400
        except (ValueError, TypeError):
            return jsonify({"success": False, "error": f"Invalid score value for {k}"}), 400

    score_entry = db.submit_score(
        event_id=event_id,
        tag_no=tag_no,
        judge_id=judge_id,
        judge_name=judge_name,
        criteria_scores=criteria_scores,
        remarks=remarks
    )

    # Permanent Google Sheet Real-time Auto-Sync
    sheets_service.trigger_background_sync(event_id)

    return jsonify({"success": True, "score": score_entry})

@app.route("/api/scores/<score_id>", methods=["PUT"])
def admin_override_score(score_id):
    data = request.get_json() or {}
    criteria_scores = data.get("scores", {})
    remarks = data.get("remarks")

    updated = db.admin_override_score(score_id, criteria_scores, remarks)
    if not updated:
        return jsonify({"success": False, "error": "Score entry not found"}), 404

    if updated.get("event_id"):
        sheets_service.trigger_background_sync(updated["event_id"])

    return jsonify({"success": True, "score": updated})

@app.route("/api/events/<event_id>/google-sheet-config", methods=["POST"])
def save_google_sheet_config(event_id):
    data = request.get_json(silent=True) or {}
    webhook_url = data.get("google_sheet_webhook_url", "").strip()
    sheet_url = data.get("google_sheet_url", "").strip()

    update_dict = {}
    if webhook_url is not None:
        update_dict["google_sheet_webhook_url"] = webhook_url
    if sheet_url is not None:
        update_dict["google_sheet_url"] = sheet_url

    updated = db.update_event(event_id, update_dict)
    # Trigger test sync
    sheets_service.trigger_background_sync(event_id)
    return jsonify({"success": True, "message": "Google Sheet permanent auto-sync configured!", "event": updated})

# --- Google Sheets Integration & Export ---

@app.route("/api/events/<event_id>/sync-sheets", methods=["POST"])
def sync_with_sheets(event_id):
    event = db.get_event(event_id)
    if not event:
        return jsonify({"success": False, "error": "Event not found"}), 404

    data = request.get_json() or {}
    sheet_url = data.get("google_sheet_url") or event.get("google_sheet_url")

    scores = db.get_scores(event_id=event_id)
    success, msg = sheets_service.export_event_scores(event, scores, sheet_url)

    if success and sheet_url:
        db.update_event(event_id, {"google_sheet_url": sheet_url})

    return jsonify({"success": success, "message": msg})

@app.route("/api/import-sheet-tags", methods=["POST"])
def import_tags():
    data = request.get_json() or {}
    url = data.get("google_sheet_url")
    col = data.get("column_index", 1)
    if not url:
        return jsonify({"success": False, "error": "Sheet URL required"}), 400

    success, msg, tags = sheets_service.import_tags_from_sheet(url, int(col))
    return jsonify({"success": success, "message": msg, "tags": tags})

@app.route("/api/events/<event_id>/export-csv", methods=["GET"])
def export_csv(event_id):
    event = db.get_event(event_id)
    if not event:
        return jsonify({"success": False, "error": "Event not found"}), 404

    scores = db.get_scores(event_id=event_id)
    judges = event.get("judges", [])
    
    all_tags = [item["tag_no"] for item in event.get("sequence", [])]
    for c in event.get("completed_tags", []):
        if c["tag_no"] not in all_tags:
            all_tags.append(c["tag_no"])

    output = io.StringIO()
    writer = csv.writer(output)

    headers = ["Tag No"]
    for j in judges:
        headers.append(f"{j['name']} (Total /100)")
    headers.extend(["Overall Average", "Judges Evaluated"])
    writer.writerow(headers)

    for tag_no in all_tags:
        row = [tag_no]
        tag_scores = [s for s in scores if s.get("tag_no") == tag_no]
        
        j_totals = []
        for j in judges:
            j_score = next((s for s in tag_scores if s.get("judge_id") == j["id"]), None)
            if j_score:
                row.append(j_score["total"])
                j_totals.append(j_score["total"])
            else:
                row.append("Pending")

        avg = round(sum(j_totals) / len(j_totals), 2) if j_totals else "-"
        row.append(avg)
        row.append(len(j_totals))
        writer.writerow(row)

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=judgement_{event['name'].replace(' ', '_')}.csv"}
    )

@app.route("/api/events/<event_id>/export-excel", methods=["GET"])
@app.route("/api/download-excel", methods=["GET"])
def export_excel(event_id=None):
    from create_excel import build_workbook
    scores = db.get_scores(event_id=event_id)
    excel_path = build_workbook(scores_data=scores)
    
    with open(excel_path, "rb") as f:
        file_bytes = f.read()

    return Response(
        file_bytes,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Agrash_MultiSheet_Judgement_Roster.xlsx"}
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5005))
    local_ip = get_local_ip()
    print(f"\n=======================================================")
    print(f"🔥 AGRASH - Production Judgement Hub is Live:")
    print(f"   🌐 Localhost:  http://127.0.0.1:{port}")
    print(f"   📲 Wi-Fi LAN:  http://{local_ip}:{port}")
    print(f"   👑 Admin:      http://{local_ip}:{port}/admin")
    print(f"   👥 Judges:     http://{local_ip}:{port}/judge/evt-agrash")
    print(f"   🔄 Sequence:   http://{local_ip}:{port}/sequence/evt-agrash")
    print(f"   📺 Projector:  http://{local_ip}:{port}/projector/evt-agrash")
    print(f"=======================================================\n")
    app.run(host="0.0.0.0", port=port, debug=True)
