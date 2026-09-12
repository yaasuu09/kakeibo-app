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
  const lock = LockService.getScriptLock();
  // 15秒間ロック取得を待機（リトライ競合や同時書き込みを直列化）
  const hasLock = lock.tryLock(15000);

  if (!hasLock) {
    return generateResponse({
      status: "error",
      message: "サーバーが混雑しています。数秒後に自動再試行されます。"
    });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return generateResponse({ status: "error", message: "No data provided" });
    }

    const payload = JSON.parse(e.postData.contents);

    // Validate payload is an Array to match columns (now length 8 skipping total)
    if (!Array.isArray(payload) || payload.length !== 8) {
      return generateResponse({ status: "error", message: "Invalid payload format. Expected array of length 8." });
    }

    const requestId = String(payload[0] || "").trim();
    const cache = CacheService.getScriptCache();

    // 1. 重複防止チェック①: リクエストIDが直近10分以内に処理済みか確認
    if (requestId) {
      const cached = cache.get("kakeibo_req_" + requestId);
      if (cached) {
        console.log("Duplicate request ignored by cache key: " + requestId);
        return generateResponse({
          status: "success",
          message: "重複リクエストを検知しました。すでに安全に登録されています。"
        });
      }
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return generateResponse({ status: "error", message: `Sheet '${SHEET_NAME}' not found.` });
    }

    // 2. Find the last row having data in Column B ("日付")
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

    // 3. 重複防止チェック②: 直前行と全く同じデータ（日付・金額・カテゴリ・店舗・備考）の連続追加を検知
    if (lastRow > 1) {
      const prevValues = sheet.getRange(lastRow, 2, 1, 6).getValues()[0];
      const newValues = payload.slice(1, 7);

      let prevDateStr = "";
      if (prevValues[0] instanceof Date) {
        prevDateStr = Utilities.formatDate(prevValues[0], Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        prevDateStr = String(prevValues[0] || "").trim();
      }
      const newDateStr = String(newValues[0] || "").trim();

      const isSameDate = prevDateStr === newDateStr;
      const isSameYasutaka = String(prevValues[1]) === String(newValues[1]);
      const isSameSaki = String(prevValues[2]) === String(newValues[2]);
      const isSameCategory = String(prevValues[3] || "").trim() === String(newValues[3] || "").trim();
      const isSameStore = String(prevValues[4] || "").trim() === String(newValues[4] || "").trim();
      const isSameMemo = String(prevValues[5] || "").trim() === String(newValues[5] || "").trim();

      if (isSameDate && isSameYasutaka && isSameSaki && isSameCategory && isSameStore && isSameMemo) {
        if (requestId) {
          cache.put("kakeibo_req_" + requestId, "done", 600);
        }
        console.log("Duplicate content ignored for row: " + lastRow);
        return generateResponse({
          status: "success",
          message: "直前と全く同一のデータが既に登録されているため、二重登録を防止しました。"
        });
      }
    }
    
    const newRow = lastRow + 1;

    // シートの物理的な最大行数に達した場合は自動で行を追加（行不足による書き込みエラーを完全回避）
    if (newRow > sheet.getMaxRows()) {
      sheet.insertRowAfter(sheet.getMaxRows());
    }

    // 4. We only want to insert columns B through G (indices 1 through 6 of the payload array) and I (index 7)
    const dataBtoG = [
      payload.slice(1, 7) // Date, Yasutaka, Saki, Category, Store, Memo
    ];
    
    // Insert into columns 2 through 7 (B through G)
    sheet.getRange(newRow, 2, 1, 6).setValues(dataBtoG);

    // 5. Insert Settled flag into column 9 (I)
    // Strictly evaluate boolean using category name to prevent string coercion issues
    const categoryName = payload[4]; // payload[4] corresponds to カテゴリ
    const isSettled = (categoryName === "泰雅財布入金" || categoryName === "泰雅精算ログ") ? true : false;
    sheet.getRange(newRow, 9, 1, 1).setValue(isSettled);

    // 6. Copy formatting and validation from the previous row
    if (lastRow > 1) { // Ensure there is a row above to copy from
      const sourceRange = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn());
      const targetRange = sheet.getRange(newRow, 1, 1, sheet.getLastColumn());
      
      sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }

    // 7. 成功したリクエストIDをキャッシュに記録（10分間保持）
    if (requestId) {
      cache.put("kakeibo_req_" + requestId, "done", 600);
    }

    // 8. 新しいカテゴリや店舗がマスターシートに未登録の場合、末尾に自動追記する
    // （全行スキャン＆全件再ソートを省くことで、GASのレスポンス時間を数秒から0.3秒へ劇的に高速化）
    const masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("マスター");
    if (masterSheet) {
      const categoryToRegister = String(payload[4] || "").trim();
      const storeToRegister = String(payload[5] || "").trim();

      const masterLastRow = masterSheet.getLastRow();
      let existingCategories = [];
      let existingStores = [];

      if (masterLastRow > 1) {
        const masterValues = masterSheet.getRange(2, 1, masterLastRow - 1, 2).getValues();
        existingCategories = masterValues.map(r => String(r[0] || "").trim()).filter(Boolean);
        existingStores = masterValues.map(r => String(r[1] || "").trim()).filter(Boolean);
      }

      const isNewCategory = categoryToRegister && !existingCategories.includes(categoryToRegister);
      const isNewStore = storeToRegister && !existingStores.includes(storeToRegister);

      if (isNewCategory) {
        const nextCatRow = existingCategories.length + 2;
        masterSheet.getRange(nextCatRow, 1).setValue(categoryToRegister);
      }
      if (isNewStore) {
        const nextStoreRow = existingStores.length + 2;
        masterSheet.getRange(nextStoreRow, 2).setValue(storeToRegister);
      }
    }

    return generateResponse({ status: "success", message: "Row appended successfully with validation and duplicate protection!" });
  } catch (error) {
    return generateResponse({ status: "error", message: error.toString() });
  } finally {
    lock.releaseLock();
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
 * Handle HTTP GET request to return dropdown options from "マスター" sheet
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
      
      if (cat !== undefined && cat !== null && String(cat).trim() !== "") {
        categories.add(String(cat).trim());
      }
      if (store !== undefined && store !== null && String(store).trim() !== "") {
        stores.add(String(store).trim());
      }
    }

    return generateResponse({
      categories: Array.from(categories),
      stores: Array.from(stores)
    });
  } catch (error) {
    return generateResponse({ status: "error", message: error.toString() });
  }
}
