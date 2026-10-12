/**
 * 🔥 AGRASH 2026 - BULLETPROOF GOOGLE APPS SCRIPT MULTI-TAB ARCHITECTURE ENGINE
 * ==============================================================================
 * SPREADSHEET ID: 1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk
 * WEB PORTAL URL: https://judgement-ten.vercel.app
 * 
 * CORE TAB ARCHITECTURE:
 * 1. "Agrash Registrations": Master input data of all registered schools & tags.
 * 2. "Attendance": Live attendance status (PRESENT / ABSENT, Desk, Check-In Time).
 * 3. Dynamic Sequence Sheets (Added ONLY as schools are marked PRESENT):
 *    - "Sequence Dance"
 *    - "Sequence Song"
 *    - "Sequence Declamation"
 *    - "Sequence Exhibition"
 * 4. Dedicated Event Marksheets:
 *    - "Dance Result"
 *    - "Song Result"
 *    - "Declamation Result"
 *    - "Science Result"
 * 5. Overall Trophy Leaderboard:
 *    - "Championship" (Combined 4-event total out of 210)
 */

var TARGET_SPREADSHEET_ID = "1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk";

var FORBIDDEN_TABS = [
  "Group Dance", "Group Song", "Declamation", "Science Exhibition",
  "Live Scores", "Final Result", "Master Registrations",
  "registration_dance", "registration_song", "registration_declamation", "registration_science",
  "Sheet1", "Sheet2"
];

var TAB_RENAME_MAP = {
  "Group Dance": "Dance Result",
  "Group Song": "Song Result",
  "Declamation": "Declamation Result",
  "Science Exhibition": "Science Result",
  "Live Scores": "Championship",
  "Final Result": "Championship",
  "Master Registrations": "Attendance"
};

function purgeForbiddenSheets(ss) {
  var deleted = [];
  for (var i = 0; i < FORBIDDEN_TABS.length; i++) {
    var sh = ss.getSheetByName(FORBIDDEN_TABS[i]);
    if (sh && ss.getSheets().length > 1) {
      try {
        ss.deleteSheet(sh);
        deleted.push(FORBIDDEN_TABS[i]);
      } catch (e) {}
    }
  }
  return deleted;
}

/**
 * Custom Menu inside Google Sheets
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("⚡ AGRASH 2026")
    .addItem("🚀 1-CLICK RUN: Sync All Sheets Now", "oneClickSyncAllSheets")
    .addSeparator()
    .addItem("🔄 Read 'Agrash Registrations' -> Update Attendance", "syncMainSheetToAttendance")
    .addItem("📋 Setup / Verify All Clean Tabs", "setupAllCleanTabs")
    .addItem("⚡ Setup Real-time onEdit Trigger (Safe)", "setupTriggers")
    .addItem("🛑 Delete ALL Background Timers (Stop Wiping)", "removeAllBackgroundTriggers")
    .addItem("🧹 Clean Old Duplicate Tabs (Permanent)", "cleanUnwantedTabs")
    .addToUi();
}

/**
 * WebApp GET Handler
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";

  // Permanent Delete Tabs Trigger via GET
  if (action === "delete_tabs") {
    try {
      var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
      var del = purgeForbiddenSheets(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Purged all old duplicate tabs successfully!",
        deleted_tabs: del,
        remaining_tabs: ss.getSheets().map(function(s) { return s.getName(); })
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 1. Return Master Registrations JSON to Web Portal
  if (action === "get_registrations") {
    try {
      var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
      var masterSheet = getAgrashMasterSheet(ss);
      if (!masterSheet) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "Could not find 'Agrash Registrations' tab"
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var schools = parseAgrashSheetData(masterSheet);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        count: schools.length,
        schools: schools
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: err.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 2. Cloud Backup Query & Dedicated Sequence Query
  if (action === "get_sequence") {
    var props = PropertiesService.getScriptProperties();
    var evId = (e.parameter.event_id || "").toString().trim();
    if (evId) {
      var sData = props.getProperty("agrash_seq_" + evId);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        data: sData ? JSON.parse(sData) : null
      })).setMimeType(ContentService.MimeType.JSON);
    }
    var allSeq = {};
    ["evt-group-dance", "evt-group-song", "evt-declamation", "evt-science-exhibition"].forEach(function(eid) {
      var s = props.getProperty("agrash_seq_" + eid);
      if (s) allSeq[eid] = JSON.parse(s);
    });
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      sequences: allSeq
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "get_state" || action === "get_scores" || action === "get_events") {
    var props = PropertiesService.getScriptProperties();
    var scoresJson = props.getProperty("agrash_scores") || "[]";
    var compJson = props.getProperty("agrash_completed_tags") || "{}";
    var attJson = props.getProperty("agrash_attendance_data") || "{}";
    var eventsJson = props.getProperty("agrash_events") || "[]";
    var allSeqMap = {};
    ["evt-group-dance", "evt-group-song", "evt-declamation", "evt-science-exhibition"].forEach(function(eid) {
      var s = props.getProperty("agrash_seq_" + eid);
      if (s) allSeqMap[eid] = JSON.parse(s);
    });
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      scores: JSON.parse(scoresJson),
      completed_tags: JSON.parse(compJson),
      attendance: JSON.parse(attJson),
      events: JSON.parse(eventsJson),
      sequences: allSeqMap
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    sheet_id: TARGET_SPREADSHEET_ID,
    message: "⚡ Agrash 2026 Live Sync & Dedicated Tab Architecture Engine is ACTIVE!"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * WebApp POST Handler (Receives updates from Web Portal with Tab Routing & Score Preservation)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No data received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var payload = JSON.parse(e.postData.contents);
    var sheetId = payload.sheet_id || TARGET_SPREADSHEET_ID;
    var ss = SpreadsheetApp.openById(sheetId);
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Could not open spreadsheet with ID: " + sheetId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Always purge forbidden legacy tabs on every write
    purgeForbiddenSheets(ss);

    // 0. Cloud Events & Active Judges Backup
    if (payload.action === "save_events" && payload.events) {
      var props = PropertiesService.getScriptProperties();
      props.setProperty("agrash_events", JSON.stringify(payload.events));
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        count: payload.events.length,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 0.1 Dedicated Cloud Sequence Backup (Version Protected)
    if (payload.action === "save_sequence" && payload.event_id) {
      var props = PropertiesService.getScriptProperties();
      var key = "agrash_seq_" + payload.event_id;
      var curStr = props.getProperty(key);
      var curObj = curStr ? JSON.parse(curStr) : null;
      var inVer = Number(payload.seq_version) || Date.now();

      if (!curObj || !curObj.seq_version || inVer >= Number(curObj.seq_version)) {
        var toSave = {
          event_id: payload.event_id,
          sequence: payload.sequence || [],
          completed_tags: payload.completed_tags || [],
          seq_version: inVer,
          updated_at: payload.updated_at || new Date().toISOString()
        };
        props.setProperty(key, JSON.stringify(toSave));
        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          event_id: payload.event_id,
          seq_version: inVer
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: "ignored",
          reason: "stale_version",
          current_version: curObj.seq_version
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 1. Cloud Score Backup
    if (payload.action === "save_score" && payload.score) {
      var props = PropertiesService.getScriptProperties();
      var existingScores = JSON.parse(props.getProperty("agrash_scores") || "[]");
      var sc = payload.score;
      var found = false;
      for (var sIdx = 0; sIdx < existingScores.length; sIdx++) {
        if (existingScores[sIdx].event_id === sc.event_id && existingScores[sIdx].tag_no === sc.tag_no && existingScores[sIdx].judge_id === sc.judge_id) {
          existingScores[sIdx] = sc;
          found = true;
          break;
        }
      }
      if (!found) existingScores.push(sc);
      props.setProperty("agrash_scores", JSON.stringify(existingScores));
      return ContentService.createTextOutput(JSON.stringify({ status: "success", count: existingScores.length })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Cloud Completed Tag Backup
    if (payload.action === "complete_tag" && payload.tag_no) {
      var props = PropertiesService.getScriptProperties();
      var compMap = JSON.parse(props.getProperty("agrash_completed_tags") || "{}");
      var evKey = payload.event_id || "all";
      if (!compMap[evKey]) compMap[evKey] = [];
      if (compMap[evKey].indexOf(payload.tag_no) === -1) compMap[evKey].push(payload.tag_no);
      props.setProperty("agrash_completed_tags", JSON.stringify(compMap));
      return ContentService.createTextOutput(JSON.stringify({ status: "success", completed: compMap[evKey] })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Tab Deletion Support
    if (payload.action === "delete_tabs" || payload.delete_tabs) {
      var deleted = purgeForbiddenSheets(ss);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        deleted_tabs: deleted,
        remaining_tabs: ss.getSheets().map(function(s) { return s.getName(); })
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Normalize & Remap Tab Name
    var rawTabName = (payload.tab_name || "").toString().trim();
    if (!rawTabName) {
      rawTabName = "Championship";
    }
    var tabName = TAB_RENAME_MAP[rawTabName] || rawTabName;
    if (FORBIDDEN_TABS.indexOf(tabName) !== -1) {
      tabName = TAB_RENAME_MAP[tabName] || "Championship";
    }

    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }

    var incomingRows = payload.rows || [];
    if (incomingRows.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "No rows provided" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var existingData = sheet.getDataRange().getValues();
    var finalRows = [];

    var isSequenceSheet = (tabName.indexOf("Sequence ") === 0);
    var isResultSheet = (tabName.indexOf("Result") !== -1);
    var isChampionshipSheet = (tabName === "Championship");
    var isAttendanceSheet = (tabName === "Attendance");

    // Cache Attendance in Properties for fast cloud retrieval
    if (isAttendanceSheet && incomingRows.length > 1) {
      try {
        var attProps = PropertiesService.getScriptProperties();
        var attObj = {};
        for (var ar = 1; ar < incomingRows.length; ar++) {
          var aRow = incomingRows[ar];
          var aSchool = (aRow[1] || "").toString().trim();
          if (aSchool) {
            attObj[aSchool] = {
              arrived: aRow[8] || "",
              check_in: aRow[9] || "",
              dance: aRow[4] || "",
              song: aRow[5] || "",
              declamation: aRow[6] || "",
              science: aRow[7] || ""
            };
          }
        }
        attProps.setProperty("agrash_attendance_data", JSON.stringify(attObj));
      } catch (eAtt) {}
    }

    // =========================================================================
    // CASE 1: EVENT RESULT MARKSHEETS (Dance Result, Song Result, Declamation Result, Science Result)
    // Preserves existing judge scores so they NEVER get wiped by "Pending"
    // =========================================================================
    if (isResultSheet && existingData.length > 1) {
      var existingTagMap = {};
      for (var er = 1; er < existingData.length; er++) {
        var exRow = existingData[er];
        var exTag = (exRow[1] || "").toString().trim().toUpperCase();
        if (exTag) {
          existingTagMap[exTag] = exRow;
        }
      }

      var incomingHeaders = incomingRows[0];
      var judgeStartCol = 4;
      var judgeEndCol = incomingHeaders.length - 4; // up to Overall Average

      function getCleanJudgeName(headerStr) {
        return (headerStr || "").toString().split("(")[0].trim().toLowerCase();
      }

      var exJudgeColMap = {};
      var existingHeaders = existingData[0] || [];
      for (var eh = 4; eh < existingHeaders.length - 4; eh++) {
        var jKey = getCleanJudgeName(existingHeaders[eh]);
        if (jKey) exJudgeColMap[jKey] = eh;
      }

      for (var r = 1; r < incomingRows.length; r++) {
        var inRow = incomingRows[r];
        var inTag = (inRow[1] || "").toString().trim().toUpperCase();
        var exRow = existingTagMap[inTag];

        if (exRow) {
          var mergedRow = inRow.slice();

          // 1. Preserve Attendance
          var exAtt = (exRow[3] || "").toString().trim();
          var inAtt = (inRow[3] || "").toString().trim();
          if (exAtt.indexOf("PRESENT") !== -1 && inAtt.indexOf("PENDING") !== -1) {
            mergedRow[3] = exAtt;
          }

          // 2. Preserve Judge Scores dynamically
          for (var c = judgeStartCol; c < judgeEndCol; c++) {
            var inScore = (inRow[c] !== undefined ? inRow[c] : "").toString().trim();
            var jName = getCleanJudgeName(incomingHeaders[c]);
            var matchingExCol = exJudgeColMap[jName];
            var exScore = (matchingExCol !== undefined && exRow[matchingExCol] !== undefined) ? exRow[matchingExCol].toString().trim() : "";

            var isExScoreNumeric = (exScore !== "" && exScore !== "Pending" && exScore !== "-" && !isNaN(Number(exScore)));
            var isInScoreEmpty = (inScore === "" || inScore === "Pending" || inScore === "-");

            if (isExScoreNumeric && isInScoreEmpty) {
              mergedRow[c] = Number(exScore);
            }
          }

          // 3. Recalculate Average if scores were preserved
          var numScores = [];
          for (var sc = judgeStartCol; sc < judgeEndCol; sc++) {
            var val = mergedRow[sc];
            if (val !== "" && val !== "Pending" && val !== "-" && !isNaN(Number(val))) {
              numScores.push(Number(val));
            }
          }

          if (numScores.length > 0) {
            var sum = 0;
            for (var k = 0; k < numScores.length; k++) sum += numScores[k];
            var avg = Math.round((sum / numScores.length) * 100) / 100;
            var totalJudges = judgeEndCol - judgeStartCol;
            mergedRow[judgeEndCol] = avg;
            mergedRow[judgeEndCol + 1] = numScores.length + "/" + totalJudges;
          }

          finalRows.push(mergedRow);
        } else {
          finalRows.push(inRow);
        }
      }

      // Re-sort all scored rows descending by average
      var scoredRows = [];
      var unscoredRows = [];
      for (var fr = 0; fr < finalRows.length; fr++) {
        var rowItem = finalRows[fr];
        var avgVal = rowItem[judgeEndCol];
        if (avgVal !== undefined && avgVal !== "" && avgVal !== "-" && avgVal !== "Pending" && !isNaN(Number(avgVal))) {
          scoredRows.push(rowItem);
        } else {
          unscoredRows.push(rowItem);
        }
      }

      scoredRows.sort(function(a, b) {
        return Number(b[judgeEndCol]) - Number(a[judgeEndCol]);
      });

      var reRanked = [incomingHeaders];
      for (var sr = 0; sr < scoredRows.length; sr++) {
        var sRow = scoredRows[sr];
        sRow[0] = "#" + (sr + 1);
        reRanked.push(sRow);
      }
      for (var ur = 0; ur < unscoredRows.length; ur++) {
        var uRow = unscoredRows[ur];
        uRow[0] = "-";
        reRanked.push(uRow);
      }
      finalRows = reRanked;

    // =========================================================================
    // CASE 2: ATTENDANCE SHEET (Attendance / Master Registrations)
    // Preserves ARRIVED and PRESENT so they NEVER revert to PENDING
    // =========================================================================
    } else if (isAttendanceSheet && existingData.length > 1) {
      var existingSchMap = {};
      for (var mr = 1; mr < existingData.length; mr++) {
        var mRow = existingData[mr];
        var sName = cleanSchoolKey((mRow[1] || "").toString());
        if (sName) {
          existingSchMap[sName] = mRow;
        }
      }

      finalRows.push(incomingRows[0]);
      for (var ir = 1; ir < incomingRows.length; ir++) {
        var inMRow = incomingRows[ir];
        var schKey = cleanSchoolKey((inMRow[1] || "").toString());
        var exMRow = existingSchMap[schKey];

        if (exMRow) {
          var mergedM = inMRow.slice();
          // Col 4: Dance, Col 5: Song, Col 6: Dec, Col 7: Sci
          for (var catCol = 4; catCol <= 7; catCol++) {
            var exVal = (exMRow[catCol] || "").toString();
            var inVal = (inMRow[catCol] || "").toString();
            if (exVal.indexOf("PRESENT") !== -1 && inVal.indexOf("PENDING") !== -1) {
              mergedM[catCol] = exVal;
            }
          }
          // Col 8: Arrival Status (Preserve ARRIVED)
          var exArr = (exMRow[8] || "").toString();
          var inArr = (inMRow[8] || "").toString();
          if (exArr.indexOf("ARRIVED") !== -1 && inArr.indexOf("PENDING") !== -1) {
            mergedM[8] = exArr;
          }
          // Col 9: Check-In Time
          var exTime = (exMRow[9] || "").toString();
          var inTime = (inMRow[9] || "").toString();
          if (exTime !== "-" && exTime !== "" && (inTime === "-" || inTime === "")) {
            mergedM[9] = exTime;
          }
          finalRows.push(mergedM);
        } else {
          finalRows.push(inMRow);
        }
      }

    // =========================================================================
    // CASE 3: SEQUENCE SHEETS & CHAMPIONSHIP SHEET
    // =========================================================================
    } else {
      finalRows = incomingRows;
    }

    // =========================================================================
    // WRITE DATA TO SHEET & APPLY GORGEOUS FORMATTING
    // =========================================================================
    sheet.clear();
    var numRows = finalRows.length;
    var numCols = finalRows[0].length;

    var range = sheet.getRange(1, 1, numRows, numCols);
    range.setValues(finalRows);
    range.setVerticalAlignment("middle");
    range.setFontFamily("Arial");
    range.setFontSize(10);

    // Freeze header row
    sheet.setFrozenRows(1);

    // Header styling
    var headerRange = sheet.getRange(1, 1, 1, numCols);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#0f172a");
    headerRange.setFontColor("#ffffff");
    headerRange.setHorizontalAlignment("center");
    sheet.setRowHeight(1, 32);

    // Column Alignment
    for (var col = 1; col <= numCols; col++) {
      if (col === 2 || col === 3) {
        sheet.getRange(2, col, numRows - 1, 1).setHorizontalAlignment("left");
      } else {
        sheet.getRange(2, col, numRows - 1, 1).setHorizontalAlignment("center");
      }
    }

    // Sequence Highlight (Vibrant Amber for LIVE ON STAGE)
    if (isSequenceSheet) {
      for (var seqR = 2; seqR <= numRows; seqR++) {
        var statusCell = (finalRows[seqR - 1][4] || "").toString();
        if (statusCell.indexOf("LIVE ON STAGE") !== -1 || statusCell.indexOf("ON STAGE") !== -1) {
          sheet.getRange(seqR, 1, 1, numCols).setBackground("#fef08a"); // Soft bright yellow
          sheet.getRange(seqR, 1, 1, numCols).setFontWeight("bold");
        } else if (statusCell.indexOf("COMPLETED") !== -1) {
          sheet.getRange(seqR, 1, 1, numCols).setBackground("#f8fafc"); // Subtle completed gray
          sheet.getRange(seqR, 1, 1, numCols).setFontColor("#64748b");
        }
      }
    }

    // Result & Championship Leaderboard Top 3 Highlights (Gold, Silver, Bronze)
    if (isResultSheet || isChampionshipSheet) {
      if (numRows > 1 && finalRows[1][0] === "#1") sheet.getRange(2, 1, 1, numCols).setBackground("#fef3c7");
      if (numRows > 2 && finalRows[2][0] === "#2") sheet.getRange(3, 1, 1, numCols).setBackground("#f1f5f9");
      if (numRows > 3 && finalRows[3][0] === "#3") sheet.getRange(4, 1, 1, numCols).setBackground("#ffedd5");
    }

    for (var c = 1; c <= numCols; c++) {
      sheet.autoResizeColumn(c);
    }

    if (sheet.getMaxColumns() > numCols) {
      try {
        sheet.deleteColumns(numCols + 1, sheet.getMaxColumns() - numCols);
      } catch (eDelCols) {}
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      sheet_title: ss.getName(),
      tab: tabName,
      updated_rows: numRows,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("doPost error: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ⚡ Syncs 'Agrash Registrations' directly to 'Attendance' tab preserving live timestamps
 */
function syncMainSheetToAttendance() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  if (!ss) return;

  var masterSheet = getAgrashMasterSheet(ss);
  if (!masterSheet) {
    SpreadsheetApp.getUi().alert("Error", "Could not find 'Agrash Registrations' tab in your Google Sheet.", SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  var schoolsToSync = parseAgrashSheetData(masterSheet);
  syncAttendanceTab(ss, schoolsToSync);
  SpreadsheetApp.getUi().alert("✅ Attendance Tab Updated!", "Successfully synced " + schoolsToSync.length + " schools into 'Attendance' tab with live desk numbers.", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Parses schools data from Agrash Registrations tab dynamically
 */
function parseAgrashSheetData(masterSheet) {
  var data = masterSheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var header = data[0].map(function(h) { return h.toString().trim().toLowerCase(); });

  var colSchool = findColIndex(header, ["school name", "school", "name of school", "institution"]);
  if (colSchool === -1) colSchool = 0;

  var colDance = findColIndex(header, ["group dance", "dance"]);
  var colSong = findColIndex(header, ["group song", "song"]);
  var colDec = findColIndex(header, ["declamation", "speech"]);
  var colSci = findColIndex(header, ["science exhibition", "science"]);
  var colRoom = findColIndex(header, ["green room", "room allocation", "room", "room no"]);

  function getTagCol(catCol) {
    if (catCol >= 0 && catCol + 1 < header.length) {
      var nextH = header[catCol + 1];
      if (nextH.indexOf("tag") !== -1 || nextH === "") {
        return catCol + 1;
      }
    }
    return -1;
  }

  var colDanceTag = getTagCol(colDance);
  var colSongTag = getTagCol(colSong);
  var colDecTag = getTagCol(colDec);
  var colSciTag = getTagCol(colSci);

  if (colDanceTag === -1) colDanceTag = 2;
  if (colSongTag === -1) colSongTag = 4;
  if (colDecTag === -1) colDecTag = 6;
  if (colSciTag === -1) colSciTag = 8;
  if (colRoom === -1) colRoom = 9;

  var schoolsToSync = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var schoolName = (row[colSchool] || "").toString().trim();
    if (!schoolName) continue;
    if (/^\d+$/.test(schoolName)) continue;

    function extractTag(tagCol, flagCol) {
      var tagVal = tagCol >= 0 ? (row[tagCol] || "").toString().trim() : "";
      if (tagVal) return tagVal;
      var flagVal = flagCol >= 0 ? (row[flagCol] || "").toString().trim() : "";
      if (flagVal && flagVal.toUpperCase() !== "YES" && flagVal.toUpperCase() !== "NO") {
        return flagVal;
      }
      return "";
    }

    schoolsToSync.push({
      school_name: schoolName,
      dance_tag: extractTag(colDanceTag, colDance),
      song_tag: extractTag(colSongTag, colSong),
      declamation_tag: extractTag(colDecTag, colDec),
      science_tag: extractTag(colSciTag, colSci),
      room_no: (colRoom >= 0 ? (row[colRoom] || "").toString().trim() : "") || "TBD"
    });
  }
  return schoolsToSync;
}

/**
 * Finds master input sheet
 */
function getAgrashMasterSheet(ss) {
  var possibleNames = [
    "Agrash Registrations",
    "AGRASH REGISTRATION",
    "Agrash Registration",
    "agrash_schools_sheet",
    "Master",
    "Registration"
  ];
  for (var i = 0; i < possibleNames.length; i++) {
    var s = ss.getSheetByName(possibleNames[i]);
    if (s) return s;
  }
  return null;
}

/**
 * Updates 'Attendance' tab with arrival status across 6 desks
 */
function syncAttendanceTab(ss, schools) {
  var sheet = ss.getSheetByName("Attendance");
  if (!sheet) {
    sheet = ss.insertSheet("Attendance");
  }

  var existingData = sheet.getDataRange().getValues();
  var existingMap = {};
  if (existingData.length > 1) {
    for (var i = 1; i < existingData.length; i++) {
      var schName = cleanSchoolKey((existingData[i][1] || "").toString());
      if (schName) {
        existingMap[schName] = existingData[i];
      }
    }
  }

  var headers = [
    "S.No", "School Name", "Assigned Desk", "Room / Flat",
    "Group Dance", "Group Song", "Declamation", "Science Exhibition",
    "Arrival Status", "Check-In Time", "Last Updated"
  ];

  var rows = [headers];
  var totalSchools = schools.length;
  var schoolsPerDesk = Math.ceil(totalSchools / 6);
  var nowStr = Utilities.formatDate(new Date(), "GMT+5:30", "hh:mm a");

  for (var idx = 0; idx < schools.length; idx++) {
    var s = schools[idx];
    var calculatedDesk = Math.min(6, Math.floor(idx / schoolsPerDesk) + 1);
    var key = cleanSchoolKey(s.school_name);

    var arrivalStatus = "⏳ PENDING";
    var checkInTime = "-";

    if (existingMap[key]) {
      arrivalStatus = existingMap[key][8] || "⏳ PENDING";
      checkInTime = existingMap[key][9] || "-";
    }

    function formatTag(tag, existingCell) {
      if (!tag) return "-";
      if (existingCell && existingCell.toString().indexOf(tag) !== -1) {
        return existingCell.toString();
      }
      return tag + " (⏳ PENDING)";
    }

    var ex = existingMap[key];
    var danceVal = formatTag(s.dance_tag, ex ? ex[4] : null);
    var songVal = formatTag(s.song_tag, ex ? ex[5] : null);
    var decVal = formatTag(s.declamation_tag, ex ? ex[6] : null);
    var sciVal = formatTag(s.science_tag, ex ? ex[7] : null);

    rows.push([
      "#" + (idx + 1),
      s.school_name,
      "Desk " + calculatedDesk,
      s.room_no || "TBD",
      danceVal,
      songVal,
      decVal,
      sciVal,
      arrivalStatus,
      checkInTime,
      nowStr
    ]);
  }

  sheet.clear();
  var range = sheet.getRange(1, 1, rows.length, headers.length);
  range.setValues(rows);
  range.setVerticalAlignment("middle");
  range.setFontFamily("Arial");
  range.setFontSize(10);

  sheet.setFrozenRows(1);
  var hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setFontWeight("bold");
  hRange.setBackground("#0f172a");
  hRange.setFontColor("#ffffff");
  hRange.setHorizontalAlignment("center");
  sheet.setRowHeight(1, 32);

  for (var c = 1; c <= headers.length; c++) {
    if (c === 2) {
      sheet.getRange(2, c, rows.length - 1, 1).setHorizontalAlignment("left");
    } else {
      sheet.getRange(2, c, rows.length - 1, 1).setHorizontalAlignment("center");
    }
    sheet.autoResizeColumn(c);
  }
}

/**
 * Creates/Verifies all dedicated tabs
 */
function setupAllCleanTabs() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var requiredTabs = [
    "Agrash Registrations",
    "Attendance",
    "Sequence Dance",
    "Sequence Song",
    "Sequence Declamation",
    "Sequence Exhibition",
    "Dance Result",
    "Song Result",
    "Declamation Result",
    "Science Result",
    "Championship"
  ];

  var created = [];
  for (var i = 0; i < requiredTabs.length; i++) {
    var tName = requiredTabs[i];
    var sh = ss.getSheetByName(tName);
    if (!sh) {
      ss.insertSheet(tName);
      created.push(tName);
    }
  }

  SpreadsheetApp.getUi().alert("✅ Tabs Ready", "All dedicated tabs are verified and active.\nCreated: " + (created.length > 0 ? created.join(", ") : "All tabs already exist!"), SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Auto-trigger when any edit happens in Google Sheets
 */
function onEdit(e) {
  try {
    if (e && e.range) {
      var sName = e.range.getSheet().getName();
      if (sName === "Agrash Registrations" || sName === "AGRASH REGISTRATION" || sName === "agrash_schools_sheet") {
        syncMainSheetToAttendance();
      }
    }
  } catch (err) {
    Logger.log("onEdit error: " + err.toString());
  }
}

/**
 * Setup Triggers for Real-time Execution (Deletes any repeating timers permanently)
 */
function setupTriggers() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  ScriptApp.newTrigger("onEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert("✅ Triggers Configured!", "Real-time onEdit auto-sync is now ACTIVE.\nAll background wiping timers have been DELETED permanently.", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Removes ALL background triggers to stop accidental repeated auto-wiping
 */
function removeAllBackgroundTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var count = triggers.length;
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  SpreadsheetApp.getUi().alert("✅ Triggers Cleared", "Removed all " + count + " background triggers.\nYour sheet is now 100% safe from periodic wipes.", SpreadsheetApp.getUi().ButtonSet.OK);
}

function cleanUnwantedTabs() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var deleted = purgeForbiddenSheets(ss);
  SpreadsheetApp.getUi().alert("✅ Old Tabs Removed", "Successfully deleted " + deleted.length + " old duplicate tabs:\n" + (deleted.length > 0 ? deleted.join(", ") : "None found! Sheet is clean."), SpreadsheetApp.getUi().ButtonSet.OK);
}

function findColIndex(header, candidates) {
  for (var i = 0; i < header.length; i++) {
    var h = header[i];
    for (var j = 0; j < candidates.length; j++) {
      if (h.indexOf(candidates[j]) !== -1) {
        return i;
      }
    }
  }
  return -1;
}

function cleanSchoolKey(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

/**
 * 🚀 1-CLICK ALL SHEETS SYNC ENGINE
 * Automatically synchronizes EVERYTHING in a single click:
 * 1. Purges old legacy tabs
 * 2. Syncs 'Agrash Registrations' -> 'Attendance' tab
 * 3. Builds & updates all 4 dynamic sequence sheets ("Sequence Dance", "Sequence Song", "Sequence Declamation", "Sequence Exhibition") directly from all PRESENT approved teams
 * 4. Calls Web Portal cloud API to trigger marksheet, judge columns & championship calculation updates
 */
function oneClickSyncAllSheets() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  if (!ss) return;

  // 1. Purge unwanted tabs
  purgeForbiddenSheets(ss);

  // 2. Read Agrash Registrations -> Sync Attendance
  var masterSheet = getAgrashMasterSheet(ss);
  var schoolsCount = 0;
  if (masterSheet) {
    var schoolsToSync = parseAgrashSheetData(masterSheet);
    syncAttendanceTab(ss, schoolsToSync);
    schoolsCount = schoolsToSync.length;
  }

  // 3. Build & Sync all 4 sequence sheets directly from Attendance PRESENT teams
  var attendanceSheet = ss.getSheetByName("Attendance");
  var seqCounts = { dance: 0, song: 0, declamation: 0, science: 0 };
  if (attendanceSheet) {
    seqCounts = syncAllSequenceTabsFromAttendance(ss, attendanceSheet);
  }

  // 4. Trigger Web Portal sync via HTTP if available
  var portalStatus = "Direct Sheets Synced";
  try {
    var portalUrl = "https://judgement-ten.vercel.app/api/registration/pull-from-sheet";
    var resp = UrlFetchApp.fetch(portalUrl, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() === 200) {
      portalStatus = "Cloud Web Portal Synced (200 OK)";
    }
  } catch (ePortal) {
    portalStatus = "Synced Directly in Google Sheets";
  }

  ui.alert(
    "⚡ 1-CLICK FULL SYNC COMPLETE!",
    "All sheets have been successfully updated:\n\n" +
    "• Schools in Attendance: " + schoolsCount + "\n" +
    "• Dance Sequence Queue: " + seqCounts.dance + " teams\n" +
    "• Song Sequence Queue: " + seqCounts.song + " teams\n" +
    "• Declamation Sequence Queue: " + seqCounts.declamation + " teams\n" +
    "• Science Sequence Queue: " + seqCounts.science + " teams\n" +
    "• Status: " + portalStatus,
    ui.ButtonSet.OK
  );
}

/**
 * Builds and updates all 4 dynamic sequence tabs directly from Attendance PRESENT records
 */
function syncAllSequenceTabsFromAttendance(ss, attendanceSheet) {
  var data = attendanceSheet.getDataRange().getValues();
  if (data.length <= 1) return { dance: 0, song: 0, declamation: 0, science: 0 };

  var nowStr = Utilities.formatDate(new Date(), "GMT+5:30", "hh:mm a");

  var danceItems = [];
  var songItems = [];
  var decItems = [];
  var sciItems = [];

  function extractTag(cellStr) {
    var s = (cellStr || "").toString().trim();
    if (!s || s === "-") return "";
    return s.split("(")[0].trim();
  }

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var school = (row[1] || "").toString().trim();
    var room = (row[3] || "").toString().trim() || "TBD";
    var checkIn = (row[9] || "").toString().trim() || nowStr;

    var dCell = (row[4] || "").toString().toUpperCase();
    var sCell = (row[5] || "").toString().toUpperCase();
    var dcCell = (row[6] || "").toString().toUpperCase();
    var seCell = (row[7] || "").toString().toUpperCase();

    if (dCell.indexOf("PRESENT") !== -1) {
      var dTag = extractTag(row[4]);
      if (dTag) danceItems.push({ tag: dTag, school: school, room: room, time: checkIn });
    }
    if (sCell.indexOf("PRESENT") !== -1) {
      var sTag = extractTag(row[5]);
      if (sTag) songItems.push({ tag: sTag, school: school, room: room, time: checkIn });
    }
    if (dcCell.indexOf("PRESENT") !== -1) {
      var dcTag = extractTag(row[6]);
      if (dcTag) decItems.push({ tag: dcTag, school: school, room: room, time: checkIn });
    }
    if (seCell.indexOf("PRESENT") !== -1) {
      var seTag = extractTag(row[7]);
      if (seTag) sciItems.push({ tag: seTag, school: school, room: room, time: checkIn });
    }
  }

  function writeSequenceSheet(tabName, items) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) sheet = ss.insertSheet(tabName);

    var headers = ["Seq Order", "Tag No", "School Name", "Room / Flat", "Stage Status", "Approved Time", "Last Updated"];
    var rows = [headers];

    if (items.length === 0) {
      rows.push(["-", "-", "No teams registered present yet", "-", "WAITING FOR DESK APPROVAL", "-", nowStr]);
    } else {
      var existingData = sheet.getDataRange().getValues();
      var existingTags = [];
      var existingRowsMap = {};
      if (existingData.length > 1) {
        for (var er = 1; er < existingData.length; er++) {
          var eTag = (existingData[er][1] || "").toString().trim();
          if (eTag && eTag !== "-") {
            existingTags.push(eTag);
            existingRowsMap[eTag.toUpperCase().replace(/\s+/g, '').replace(/-/g, '')] = existingData[er];
          }
        }
      }

      var itemsMap = {};
      for (var k = 0; k < items.length; k++) {
        var normK = (items[k].tag || "").toString().toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
        itemsMap[normK] = items[k];
      }

      var finalSequenceItems = [];
      // 1. Preserve existing queue order (keeps current on-stage team intact!)
      for (var et = 0; et < existingTags.length; et++) {
        var normTag = existingTags[et].toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
        if (itemsMap[normTag]) {
          finalSequenceItems.push(itemsMap[normTag]);
          delete itemsMap[normTag];
        } else if (existingRowsMap[normTag]) {
          var exRow = existingRowsMap[normTag];
          finalSequenceItems.push({
            tag: existingTags[et],
            school: exRow[2] || "",
            room: exRow[3] || "TBD",
            time: exRow[5] || nowStr,
            isCompleted: (exRow[4] || "").toString().indexOf("COMPLETED") !== -1
          });
        }
      }

      // 2. Append any newly approved present teams to the bottom
      for (var remKey in itemsMap) {
        finalSequenceItems.push(itemsMap[remKey]);
      }

      for (var i = 0; i < finalSequenceItems.length; i++) {
        var it = finalSequenceItems[i];
        var isComp = it.isCompleted || false;
        var stageStatus = isComp ? "✅ COMPLETED" : ((i === 0) ? "🔴 LIVE ON STAGE" : "⏳ IN QUEUE (WAITING #" + (i + 1) + ")");
        var seqOrder = isComp ? "DONE" : ("#" + (i + 1));
        rows.push([
          seqOrder,
          it.tag,
          it.school,
          it.room,
          stageStatus,
          it.time,
          nowStr
        ]);
      }
    }

    sheet.clear();
    var numRows = rows.length;
    var numCols = headers.length;
    var range = sheet.getRange(1, 1, numRows, numCols);
    range.setValues(rows);
    range.setVerticalAlignment("middle");
    range.setFontFamily("Arial");
    range.setFontSize(10);
    sheet.setFrozenRows(1);

    var hRange = sheet.getRange(1, 1, 1, numCols);
    hRange.setFontWeight("bold");
    hRange.setBackground("#0f172a");
    hRange.setFontColor("#ffffff");
    hRange.setHorizontalAlignment("center");
    sheet.setRowHeight(1, 32);

    for (var c = 1; c <= numCols; c++) {
      if (c === 3) {
        sheet.getRange(2, c, numRows - 1, 1).setHorizontalAlignment("left");
      } else {
        sheet.getRange(2, c, numRows - 1, 1).setHorizontalAlignment("center");
      }
      sheet.autoResizeColumn(c);
    }

    if (items.length > 0) {
      sheet.getRange(2, 1, 1, numCols).setBackground("#fef08a");
      sheet.getRange(2, 1, 1, numCols).setFontWeight("bold");
    }

    if (sheet.getMaxColumns() > numCols) {
      try {
        sheet.deleteColumns(numCols + 1, sheet.getMaxColumns() - numCols);
      } catch (eDel) {}
    }
  }

  writeSequenceSheet("Sequence Dance", danceItems);
  writeSequenceSheet("Sequence Song", songItems);
  writeSequenceSheet("Sequence Declamation", decItems);
  writeSequenceSheet("Sequence Exhibition", sciItems);

  return {
    dance: danceItems.length,
    song: songItems.length,
    declamation: decItems.length,
    science: sciItems.length
  };
}
