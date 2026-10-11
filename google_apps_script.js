/**
 * 🔥 AGRASH 2026 - AUTOMATIC GOOGLE APPS SCRIPT LIVE SYNC & MULTI-SHEET ROUTER
 * =============================================================================
 * SPREADSHEET ID: 1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk
 * WEB PORTAL URL: https://judgement-ten.vercel.app
 * 
 * FEATURES:
 * 1. WebApp endpoint (doPost, doGet) for 2-way real-time score & marksheet updates.
 * 2. Automatic multi-sheet router: Jab bhi "Agrash Registrations" sheet me naya data/school
 *    add ya edit hoga, wo AUTOMATICALLY:
 *    - Charo event tabs me sync hoga ("Group Dance", "Group Song", "Declamation", "Science Exhibition")
 *    - "Master Registrations" tab me sync hoga
 *    - Web Portal (https://judgement-ten.vercel.app) me live push hoga!
 * 3. Menu "⚡ AGRASH 2026" for 1-click sync & trigger setup inside Google Sheets.
 */

var TARGET_SPREADSHEET_ID = "1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk";
var PORTAL_SYNC_URL = "https://judgement-ten.vercel.app/api/registration/sync-from-sheet";

/**
 * Custom Menu inside Google Sheets
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("⚡ AGRASH 2026")
    .addItem("🔄 Sync Agrash Registrations to All Tabs & Portal", "syncMainSheetToAllTabs")
    .addItem("⚡ Setup Automatic Triggers (onEdit & 1-Min Auto Sync)", "setupTriggers")
    .addItem("🧹 Clean Duplicate / Unwanted Tabs", "cleanUnwantedTabs")
    .addToUi();
}

/**
 * WebApp GET Handler (Health Check)
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    sheet_id: TARGET_SPREADSHEET_ID,
    message: "⚡ Agrash Live Sync & Auto-Router WebApp is active and ready to write into Google Sheet!"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * WebApp POST Handler (Receives updates from Web Portal to Google Sheet)
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

    // Tab deletion support
    if (payload.action === "delete_tabs" || payload.delete_tabs) {
      var toDelete = payload.delete_tabs || ["registration_dance", "registration_song", "registration_declamation", "registration_science", "Sheet1", "Sheet2"];
      var deleted = [];
      for (var i = 0; i < toDelete.length; i++) {
        var sh = ss.getSheetByName(toDelete[i]);
        if (sh && ss.getSheets().length > 1) {
          ss.deleteSheet(sh);
          deleted.push(toDelete[i]);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        deleted_tabs: deleted,
        remaining_tabs: ss.getSheets().map(function(s) { return s.getName(); })
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var tabName = payload.tab_name || "Live Scores";
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    sheet.clear();

    var rows = payload.rows || [];
    if (rows.length > 0) {
      var numRows = rows.length;
      var numCols = rows[0].length;
      
      var range = sheet.getRange(1, 1, numRows, numCols);
      range.setValues(rows);
      range.setVerticalAlignment("middle");
      range.setFontFamily("Arial");
      range.setFontSize(10);

      // Header styling
      var headerRange = sheet.getRange(1, 1, 1, numCols);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#0f172a");
      headerRange.setFontColor("#ffffff");
      headerRange.setHorizontalAlignment("center");
      sheet.setRowHeight(1, 32);

      // Alignment
      for (var col = 1; col <= numCols; col++) {
        if (col === 2 || col === 3) {
          sheet.getRange(2, col, numRows - 1, 1).setHorizontalAlignment("left");
        } else {
          sheet.getRange(2, col, numRows - 1, 1).setHorizontalAlignment("center");
        }
      }

      // Top 3 Highlight (for leaderboard tabs)
      if (tabName !== "Master Registrations") {
        if (numRows > 1) sheet.getRange(2, 1, 1, numCols).setBackground("#fef3c7");
        if (numRows > 2) sheet.getRange(3, 1, 1, numCols).setBackground("#f1f5f9");
        if (numRows > 3) sheet.getRange(4, 1, 1, numCols).setBackground("#ffedd5");
      }

      for (var c = 1; c <= numCols; c++) {
        sheet.autoResizeColumn(c);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      sheet_title: ss.getName(),
      tab: tabName,
      updated_rows: rows.length,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ⚡ MAIN AUTO-ROUTER: Reads 'Agrash Registrations' and Syncs to All 4 Event Sheets,
 * Master Registrations Sheet, and Web Portal
 */
function syncMainSheetToAllTabs() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  if (!ss) return;

  // Locate the Main 'Agrash Registrations' sheet
  var allSheets = ss.getSheets();
  var masterSheet = null;
  var possibleNames = [
    "Agrash Registrations",
    "AGRASH REGISTRATION",
    "Agrash Registration",
    "agrash_schools_sheet",
    "Master",
    "Registration",
    "Registrations"
  ];
  
  for (var i = 0; i < possibleNames.length; i++) {
    masterSheet = ss.getSheetByName(possibleNames[i]);
    if (masterSheet) break;
  }

  // Fallback: Pick first sheet that is not an event / result tab
  if (!masterSheet) {
    for (var k = 0; k < allSheets.length; k++) {
      var sName = allSheets[k].getName();
      if (sName !== "Group Dance" && sName !== "Group Song" && sName !== "Declamation" && sName !== "Science Exhibition" && sName !== "Final Result" && sName !== "Live Scores" && sName !== "Master Registrations") {
        masterSheet = allSheets[k];
        break;
      }
    }
  }

  if (!masterSheet) {
    Logger.log("⚠️ Agrash Registrations sheet not found.");
    return;
  }

  var data = masterSheet.getDataRange().getValues();
  if (data.length <= 1) return;

  var header = data[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  
  // Detect columns accurately
  var colSchool = findColIndex(header, ["school name", "school", "name of school", "institution"]);
  if (colSchool === -1) colSchool = 0;

  var colDance = findColIndex(header, ["group dance", "dance"]);
  var colSong = findColIndex(header, ["group song", "song"]);
  var colDec = findColIndex(header, ["declamation", "speech"]);
  var colSci = findColIndex(header, ["science exhibition", "science"]);
  var colRoom = findColIndex(header, ["green room", "room allocation", "room", "room no"]);

  // Tag column detection (immediately after category or named "tags")
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
    // Skip totals row (e.g. "66")
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

    var danceTag = extractTag(colDanceTag, colDance);
    var songTag = extractTag(colSongTag, colSong);
    var decTag = extractTag(colDecTag, colDec);
    var sciTag = extractTag(colSciTag, colSci);
    var roomNo = colRoom >= 0 ? (row[colRoom] || "").toString().trim() : "TBD";

    schoolsToSync.push({
      school_name: schoolName,
      dance_tag: danceTag,
      song_tag: songTag,
      declamation_tag: decTag,
      science_tag: sciTag,
      room_no: roomNo || "TBD"
    });
  }

  Logger.log("Parsed " + schoolsToSync.length + " schools from " + masterSheet.getName());

  // 1. Update the 4 category event tabs in Google Sheets
  var EVENT_CONFIGS = [
    { name: "Group Dance", tagKey: "dance_tag" },
    { name: "Group Song", tagKey: "song_tag" },
    { name: "Declamation", tagKey: "declamation_tag" },
    { name: "Science Exhibition", tagKey: "science_tag" }
  ];

  for (var eIdx = 0; eIdx < EVENT_CONFIGS.length; eIdx++) {
    var cfg = EVENT_CONFIGS[eIdx];
    syncEventTab(ss, cfg.name, cfg.tagKey, schoolsToSync);
  }

  // 2. Update Master Registrations tab in Google Sheets
  syncMasterRegistrationsTab(ss, schoolsToSync);

  // 3. Push to Web Portal API so live Registration Desk & Sequence Queue are updated
  try {
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ schools: schoolsToSync }),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(PORTAL_SYNC_URL, options);
    Logger.log("✅ Pushed " + schoolsToSync.length + " schools to Web Portal: " + response.getContentText());
  } catch (err) {
    Logger.log("⚠️ Portal sync notice: " + err.toString());
  }
}

/**
 * Syncs a single event tab ("Group Dance", "Group Song", etc.) preserving existing judge scores
 */
function syncEventTab(ss, tabName, tagKey, schools) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }

  var existingData = sheet.getDataRange().getValues();
  var existingMap = {};

  if (existingData.length > 1) {
    for (var i = 1; i < existingData.length; i++) {
      var row = existingData[i];
      var tagNo = (row[1] || "").toString().trim();
      if (tagNo) {
        existingMap[tagNo] = row;
      }
    }
  }

  var headers = [
    "Rank", "Tag No", "School & Details", "Attendance (Present/Absent)",
    "Judge 1 (/100)", "Judge 2 (/100)", "Judge 3 (/100)", "Judge 4 (/100)", "Judge 5 (/100)",
    "Overall Average (/100)", "Judges Scored", "Stage Status", "Last Updated"
  ];

  var newRows = [headers];
  var nowStr = Utilities.formatDate(new Date(), "GMT+5:30", "hh:mm a");

  for (var s = 0; s < schools.length; s++) {
    var sch = schools[s];
    var tag = sch[tagKey];
    if (!tag) continue;

    var schoolDetail = sch.school_name + (sch.room_no && sch.room_no !== "TBD" ? " [Room: " + sch.room_no + "]" : "");

    if (existingMap[tag]) {
      // Preserve existing judge scores & status, update school details if changed
      var exRow = existingMap[tag];
      exRow[2] = schoolDetail;
      newRows.push(exRow);
    } else {
      // Brand new row
      newRows.push([
        "-", tag, schoolDetail, "PENDING (⏳)",
        "Pending", "Pending", "Pending", "Pending", "Pending",
        "-", "0/5", "IN QUEUE", nowStr
      ]);
    }
  }

  sheet.clear();
  var rRange = sheet.getRange(1, 1, newRows.length, headers.length);
  rRange.setValues(newRows);
  rRange.setVerticalAlignment("middle");
  rRange.setFontFamily("Arial");
  rRange.setFontSize(10);

  var hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setFontWeight("bold");
  hRange.setBackground("#0f172a");
  hRange.setFontColor("#ffffff");
  hRange.setHorizontalAlignment("center");
  sheet.setRowHeight(1, 32);

  for (var col = 1; col <= headers.length; col++) {
    if (col === 3) {
      sheet.getRange(2, col, newRows.length - 1, 1).setHorizontalAlignment("left");
    } else {
      sheet.getRange(2, col, newRows.length - 1, 1).setHorizontalAlignment("center");
    }
    sheet.autoResizeColumn(col);
  }
}

/**
 * Syncs 'Master Registrations' tab with arrival status across 6 desks
 */
function syncMasterRegistrationsTab(ss, schools) {
  var sheet = ss.getSheetByName("Master Registrations");
  if (!sheet) {
    sheet = ss.insertSheet("Master Registrations");
  }

  var existingData = sheet.getDataRange().getValues();
  var existingMap = {};
  if (existingData.length > 1) {
    for (var i = 1; i < existingData.length; i++) {
      var schName = (existingData[i][1] || "").toString().trim().toLowerCase();
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
    var key = s.school_name.trim().toLowerCase();

    var arrivalStatus = "⏳ PENDING";
    var checkInTime = "-";

    if (existingMap[key]) {
      arrivalStatus = existingMap[key][8] || "⏳ PENDING";
      checkInTime = existingMap[key][9] || "-";
    }

    function formatTag(tag, existingCell) {
      if (!tag) return "-";
      if (existingCell && existingCell.toString().indexOf(tag) !== -1) {
        return existingCell.toString(); // Preserves live status like "D-21 (✅ PRESENT)"
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
 * Auto-trigger when any edit happens in Google Sheets
 */
function onEdit(e) {
  try {
    if (e && e.range) {
      var sName = e.range.getSheet().getName();
      // Only sync when someone actually edits the Agrash Registrations sheet
      if (sName === "Agrash Registrations" || sName === "AGRASH REGISTRATION" || sName === "agrash_schools_sheet") {
        syncMainSheetToAllTabs();
      }
    }
  } catch (err) {
    Logger.log("onEdit error: " + err.toString());
  }
}

/**
 * Auto-trigger on Google Form submission
 */
function onFormSubmit(e) {
  syncMainSheetToAllTabs();
}

/**
 * Setup Triggers for Real-time Execution (Instant onEdit without background wiping timer)
 */
function setupTriggers() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  // onEdit Trigger (Runs instantly ONLY when a cell in Agrash Registrations is edited)
  ScriptApp.newTrigger("onEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert("✅ Triggers Configured!", "Real-time onEdit auto-sync is now ACTIVE. Background wiping timer removed.", SpreadsheetApp.getUi().ButtonSet.OK);
}

function cleanUnwantedTabs() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var toDelete = ["registration_dance", "registration_song", "registration_declamation", "registration_science", "Sheet1", "Sheet2"];
  var count = 0;
  for (var i = 0; i < toDelete.length; i++) {
    var sh = ss.getSheetByName(toDelete[i]);
    if (sh && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
      count++;
    }
  }
  SpreadsheetApp.getUi().alert("Tabs Cleaned", "Removed " + count + " unused tabs.", SpreadsheetApp.getUi().ButtonSet.OK);
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
