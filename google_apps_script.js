/**
 * 🔥 AGRASH 2026 - Automatic Google Sheet Live Sync WebApp Script
 * =============================================================
 * 
 * STEPS TO DEPLOY (Only 30 Seconds):
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1_qSs9kB62ajDImY2-WwufeFpRM1TJZp7ocKFdcKZguk/edit
 * 2. In top menu, click: Extensions -> Apps Script
 * 3. Delete any existing code, paste this ENTIRE code, and click Save (💾).
 * 4. In top-right, click: "Deploy" -> "New deployment"
 * 5. Select Type (⚙️ gear icon): "Web app"
 * 6. Set Description: "Agrash Sync"
 * 7. Set "Execute as": "Me"
 * 8. Set "Who has access": "Anyone"  <-- IMPORTANT!
 * 9. Click "Deploy", copy the generated Web App URL, and paste it in Agrash Admin Panel!
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "⚡ Agrash Live Sync WebApp is active and ready to receive scores!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No data received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
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

      // Center-align columns
      for (var col = 1; col <= numCols; col++) {
        if (col === 3) {
          // School name left-align
          sheet.getRange(2, col, numRows - 1, 1).setHorizontalAlignment("left");
        } else {
          sheet.getRange(2, col, numRows - 1, 1).setHorizontalAlignment("center");
        }
      }

      // Highlight Top 3 Ranks
      if (numRows > 1) {
        sheet.getRange(2, 1, 1, numCols).setBackground("#fef3c7"); // #1 Gold tint
      }
      if (numRows > 2) {
        sheet.getRange(3, 1, 1, numCols).setBackground("#f1f5f9"); // #2 Silver tint
      }
      if (numRows > 3) {
        sheet.getRange(4, 1, 1, numCols).setBackground("#ffedd5"); // #3 Bronze tint
      }

      // Auto-resize columns
      for (var c = 1; c <= numCols; c++) {
        sheet.autoResizeColumn(c);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      updated_rows: rows.length,
      tab: tabName,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
