/**
 * 🔥 AGRASH 2026 - Automatic Google Sheet Live Sync WebApp Script (HARD-LINKED)
 * =============================================================================
 * SPREADSHEET ID: 1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk
 */

var TARGET_SPREADSHEET_ID = "1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk";

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    sheet_id: TARGET_SPREADSHEET_ID,
    message: "⚡ Agrash Live Sync WebApp is active and ready to write into Google Sheet!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No data received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var payload = JSON.parse(e.postData.contents);
    var sheetId = payload.sheet_id || TARGET_SPREADSHEET_ID;
    
    // Explicitly open the user's Google Sheet by ID
    var ss = SpreadsheetApp.openById(sheetId);
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Could not open spreadsheet with ID: " + sheetId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Support deleting unwanted tabs
    if (payload.action === "delete_tabs" || payload.delete_tabs) {
      var toDelete = payload.delete_tabs || [
        "registration_dance",
        "registration_song",
        "registration_declamation",
        "registration_science",
        "Master Registrations",
        "Live Scores",
        "Sheet1",
        "Sheet2"
      ];
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
      
      // Write all rows
      var range = sheet.getRange(1, 1, numRows, numCols);
      range.setValues(rows);
      range.setVerticalAlignment("middle");
      range.setFontFamily("Arial");
      range.setFontSize(10);

      // Format Header Row
      var headerRange = sheet.getRange(1, 1, 1, numCols);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#0f172a");
      headerRange.setFontColor("#ffffff");
      headerRange.setHorizontalAlignment("center");
      sheet.setRowHeight(1, 32);

      // Column Alignment
      for (var col = 1; col <= numCols; col++) {
        if (col === 3) {
          // School details column left-aligned
          sheet.getRange(2, col, numRows - 1, 1).setHorizontalAlignment("left");
        } else {
          sheet.getRange(2, col, numRows - 1, 1).setHorizontalAlignment("center");
        }
      }

      // Highlight Top 3 Ranks
      if (numRows > 1) sheet.getRange(2, 1, 1, numCols).setBackground("#fef3c7"); // #1 Gold tint
      if (numRows > 2) sheet.getRange(3, 1, 1, numCols).setBackground("#f1f5f9"); // #2 Silver tint
      if (numRows > 3) sheet.getRange(4, 1, 1, numCols).setBackground("#ffedd5"); // #3 Bronze tint

      // Auto-fit columns
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
