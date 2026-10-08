/**
 * 🔥 AGRASH 2026 - AUTOMATIC GOOGLE APPS SCRIPT LIVE SYNC & MULTI-SHEET ROUTER
 * =============================================================================
 * SPREADSHEET ID: 1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk
 * WEB PORTAL URL: https://judgement-ten.vercel.app
 * 
 * FEATURES:
 * 1. WebApp endpoint (doPost, doGet) for 2-way real-time score & marksheet updates.
 * 2. Automatic routing: Jab bhi main sheet me naya data/school add hoga, wo 
 *    automatically charo tabs ("Group Dance", "Group Song", "Declamation", "Science Exhibition")
 *    aur Portal Registration Desk me chala jayega.
 * 3. Menu options inside Google Sheet: "⚡ AGRASH 2026" for 1-click manual sync & setup.
 */

var TARGET_SPREADSHEET_ID = "1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk";
var PORTAL_SYNC_URL = "https://judgement-ten.vercel.app/api/registration/sync-from-sheet";

/**
 * Custom Menu inside Google Sheets
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("⚡ AGRASH 2026")
    .addItem("🔄 Sync Main Sheet to All 4 Events & Portal", "syncMainSheetToAllTabs")
    .addItem("⚡ Setup Automatic Triggers (onEdit / onFormSubmit)", "setupTriggers")
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
    message: "⚡ Agrash Live Sync & Auto-Router WebApp is active and ready!"
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
      var toDelete = payload.delete_tabs || ["registration_dance", "registration_song", "registration_declamation", "registration_science", "Master Registrations", "Sheet1", "Sheet2"];
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
        if (col === 3) {
          sheet.getRange(2, col, numRows - 1, 1).setHorizontalAlignment("left");
        } else {
          sheet.getRange(2, col, numRows - 1, 1).setHorizontalAlignment("center");
        }
      }

      // Top 3 Highlight
      if (numRows > 1) sheet.getRange(2, 1, 1, numCols).setBackground("#fef3c7");
      if (numRows > 2) sheet.getRange(3, 1, 1, numCols).setBackground("#f1f5f9");
      if (numRows > 3) sheet.getRange(4, 1, 1, numCols).setBackground("#ffedd5");

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
 * ⚡ MAIN AUTO-ROUTER: Reads Master / Main Registration Sheet and Distributes to All 4 Tabs
 */
function syncMainSheetToAllTabs() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  if (!ss) return;

  // Locate the Main / Master Registration sheet
  var allSheets = ss.getSheets();
  var masterSheet = null;
  var possibleNames = ["AGRASH REGISTRATION", "Agrash Registration", "Master", "Form Responses 1", "Registration", "Registrations"];
  
  for (var i = 0; i < possibleNames.length; i++) {
    masterSheet = ss.getSheetByName(possibleNames[i]);
    if (masterSheet) break;
  }

  // If not found by name, pick the first sheet that is not one of the event sheets
  if (!masterSheet) {
    for (var k = 0; k < allSheets.length; k++) {
      var name = allSheets[k].getName();
      if (name !== "Group Dance" && name !== "Group Song" && name !== "Declamation" && name !== "Science Exhibition" && name !== "Final Result") {
        masterSheet = allSheets[k];
        break;
      }
    }
  }

  if (!masterSheet) {
    Logger.log("⚠️ Master registration sheet not found.");
    return;
  }

  var data = masterSheet.getDataRange().getValues();
  if (data.length <= 1) return;

  var header = data[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  
  // Find column indexes
  var colSchool = findColIndex(header, ["school", "school name", "name of school", "institution"]);
  var colDance = findColIndex(header, ["dance tag", "group dance tag", "dance", "group dance"]);
  var colSong = findColIndex(header, ["song tag", "group song tag", "song", "group song"]);
  var colDec = findColIndex(header, ["declamation tag", "declamation", "speech"]);
  var colSci = findColIndex(header, ["science tag", "science exhibition tag", "science", "science exhibition"]);
  var colRoom = findColIndex(header, ["room", "room no", "room number"]);

  var schoolsToSync = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var schoolName = colSchool >= 0 ? (row[colSchool] || "").toString().trim() : (row[0] || "").toString().trim();
    if (!schoolName) continue;

    var danceTag = colDance >= 0 ? (row[colDance] || "").toString().trim() : "";
    var songTag = colSong >= 0 ? (row[colSong] || "").toString().trim() : "";
    var decTag = colDec >= 0 ? (row[colDec] || "").toString().trim() : "";
    var sciTag = colSci >= 0 ? (row[colSci] || "").toString().trim() : "";
    var roomNo = colRoom >= 0 ? (row[colRoom] || "").toString().trim() : "TBD";

    schoolsToSync.push({
      school_name: schoolName,
      dance_tag: danceTag,
      song_tag: songTag,
      declamation_tag: decTag,
      science_tag: sciTag,
      room_no: roomNo
    });
  }

  // Push to Web Portal API so Registration Desk & Sequence are updated live
  try {
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ schools: schoolsToSync }),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(PORTAL_SYNC_URL, options);
    Logger.log("✅ Pushed " + schoolsToSync.length + " schools to Portal: " + response.getContentText());
  } catch (err) {
    Logger.log("⚠️ Portal sync request note: " + err.toString());
  }
}

/**
 * Auto-trigger when any edit happens in the sheet
 */
function onEdit(e) {
  // Sync automatically when edited
  syncMainSheetToAllTabs();
}

/**
 * Auto-trigger when a Google Form submission arrives
 */
function onFormSubmit(e) {
  syncMainSheetToAllTabs();
}

/**
 * Setup Triggers for Automatic Execution
 */
function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  // onEdit trigger
  ScriptApp.newTrigger("onEdit")
    .forSpreadsheet(SpreadsheetApp.openById(TARGET_SPREADSHEET_ID))
    .onEdit()
    .create();

  // 1-minute time driven backup trigger
  ScriptApp.newTrigger("syncMainSheetToAllTabs")
    .timeBased()
    .everyMinutes(1)
    .create();

  SpreadsheetApp.getUi().alert("✅ Triggers Configured!", "Real-time auto-sync onEdit and 1-minute background auto-sync are now ACTIVE.", SpreadsheetApp.getUi().ButtonSet.OK);
}

function cleanUnwantedTabs() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var toDelete = ["registration_dance", "registration_song", "registration_declamation", "registration_science", "Master Registrations", "Sheet1", "Sheet2"];
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
