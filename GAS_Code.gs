/**
 * GAS_Code.gs
 * Google Apps Script Web App implementation for Kakeibo App.
 * Maps POST JSON payload directly to the "支出記録" sheet.
 */

const SHEET_NAME = "支出記録";

/**
 * Handle HTTP OPTIONS request to allow CORS preflight
 */
function doOptions(e) {
  return generateResponse({ status: "success", message: "CORS setup complete" });
}

/**
 * Handle HTTP POST request from the PWA
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return generateResponse({ status: "error", message: "No data provided" });
    }

    const payload = JSON.parse(e.postData.contents);

    // Validate payload is an Array to match columns (now length 8 skipping total)
    if (!Array.isArray(payload) || payload.length !== 8) {
      return generateResponse({ status: "error", message: "Invalid payload format. Expected array of length 8." });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return generateResponse({ status: "error", message: `Sheet '${SHEET_NAME}' not found.` });
    }

    // 1. Find the last row having data in Column B ("日付")
    // This avoids ARRAYFORMULA in Column A tricking getLastRow().
    const bValues = sheet.getRange("B:B").getValues();
    let lastRow = 0;
    for (let i = bValues.length - 1; i >= 0; i--) {
      if (bValues[i][0] !== "") {
        lastRow = i + 1; // +1 because array is 0-indexed but rows are 1-indexed
        break;
      }
    }
    
    // If the sheet is empty (only headers), start at row 2
    if (lastRow === 0) lastRow = 1;
    
    const newRow = lastRow + 1;

    // 2. We only want to insert columns B through G (indices 1 through 6 of the payload array) and I (index 7)
    const dataBtoG = [
      payload.slice(1, 7) // Date, Yasutaka, Saki, Category, Store, Memo
    ];
    
    // Insert into columns 2 through 7 (B through G)
    sheet.getRange(newRow, 2, 1, 6).setValues(dataBtoG);

    // 3. Insert Settled flag into column 9 (I)
    // Strictly evaluate boolean using category name to prevent string coercion issues
    const categoryName = payload[4]; // payload[4] corresponds to カテゴリ
    const isSettled = (categoryName === "泰雅財布入金" || categoryName === "泰雅精算ログ") ? true : false;
    sheet.getRange(newRow, 9, 1, 1).setValue(isSettled);

    // 3. Copy formatting and validation from the previous row
    if (lastRow > 1) { // Ensure there is a row above to copy from
      const sourceRange = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn());
      const targetRange = sheet.getRange(newRow, 1, 1, sheet.getLastColumn());
      
      sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }

    // 4. Update the "マスター" sheet with dynamically sorted options based on frequency
    const masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("マスター");
    if (masterSheet) {
      // 4a. Read all data from "支出記録" to count frequencies
      const allExpenseData = sheet.getDataRange().getValues();
      const categoryCounts = new Map();
      const storeCounts = new Map();
      
      // Start from 1 to skip headers
      for (let i = 1; i < allExpenseData.length; i++) {
        const cat = String(allExpenseData[i][4] || "").trim(); // Col E (Index 4)
        const store = String(allExpenseData[i][5] || "").trim(); // Col F (Index 5)
        
        if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
        if (store) storeCounts.set(store, (storeCounts.get(store) || 0) + 1);
      }
      
      // 4b. Read all current options from "マスター"
      const masterData = masterSheet.getDataRange().getValues();
      const masterCategories = new Set();
      const masterStores = new Set();
      
      for (let i = 1; i < masterData.length; i++) {
        const cat = String(masterData[i][0] || "").trim();
        const store = String(masterData[i][1] || "").trim();
        if (cat) masterCategories.add(cat);
        if (store) masterStores.add(store);
      }
      
      // 4c. Sort options by frequency (descending). If frequency is missing, default to 0.
      const sortedCategories = Array.from(masterCategories).sort((a, b) => {
        const countA = categoryCounts.get(a) || 0;
        const countB = categoryCounts.get(b) || 0;
        return countB - countA; // Descending
      });
      
      const sortedStores = Array.from(masterStores).sort((a, b) => {
        const countA = storeCounts.get(a) || 0;
        const countB = storeCounts.get(b) || 0;
        return countB - countA; // Descending
      });
      
      // 4d. Prepare arrays for writing back to Master (Col A, Col B)
      const maxLen = Math.max(sortedCategories.length, sortedStores.length);
      const writeData = [];
      for (let i = 0; i < maxLen; i++) {
        writeData.push([
          i < sortedCategories.length ? sortedCategories[i] : "",
          i < sortedStores.length ? sortedStores[i] : ""
        ]);
      }
      
      if (maxLen > 0) {
        // Clear old options (row 2 down, columns 1 to 2)
        const lastMasterRow = masterSheet.getLastRow();
        if (lastMasterRow > 1) {
          masterSheet.getRange(2, 1, lastMasterRow - 1, 2).clearContent();
        }
        // Write new sorted options to Master
        masterSheet.getRange(2, 1, maxLen, 2).setValues(writeData);
      }
    }

    return generateResponse({ status: "success", message: "Row appended successfully with validation and dynamic sorting!" });
  } catch (error) {
    return generateResponse({ status: "error", message: error.toString() });
  }
}

/**
 * Helper to return JSON Response with CORS Headers
 */
function generateResponse(responseObject) {
  const jsonResponse = ContentService.createTextOutput(JSON.stringify(responseObject));
  jsonResponse.setMimeType(ContentService.MimeType.JSON);
  
  // Return the output. To support CORS in GAS, deploying as Web App handles most headers automatically, 
  // but if needed, we return JSON. (CORS on GAS is inherently supported via redirects).
  return jsonResponse;
}

/**
 * Handle HTTP GET request to return dynamic dropdown options from "マスター" sheet
 */
function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("マスター");
    if (!sheet) {
      return generateResponse({ status: "error", message: "Sheet 'マスター' not found." });
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
       return generateResponse({ categories: [], stores: [] });
    }

    const categories = new Set();
    const stores = new Set();

    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const cat = data[i][0]; // Column A (カテゴリ)
      const store = data[i][1]; // Column B (購入先)
      
      if (cat !== undefined && cat !== null && String(cat).trim() !== "") categories.add(String(cat).trim());
      if (store !== undefined && store !== null && String(store).trim() !== "") stores.add(String(store).trim());
    }

    return generateResponse({
      categories: Array.from(categories),
      stores: Array.from(stores)
    });
  } catch (error) {
    return generateResponse({ status: "error", message: error.toString() });
  }
}
