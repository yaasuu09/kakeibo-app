/**
 * GAS_Code.gs
 * Google Apps Script Web App implementation for Kakeibo App.
 * Maps POST JSON payload directly to the "支出記録" sheet.
 * Ultra-fast execution with concurrency lock & duplicate prevention.
 */

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
  // 10秒間ロック取得を待機
  const hasLock = lock.tryLock(10000);

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

    // Validate payload is an Array of length 8
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

    const targetSheetName = "支出記録";
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(targetSheetName);
    if (!sheet) {
      return generateResponse({ status: "error", message: `Sheet '${targetSheetName}' not found.` });
    }

    // 2. 超高速最終行取得（getNextDataCellにより0.01秒で判定）
    let lastRow = 1;
    try {
      const cellB1 = sheet.getRange("B1");
      const nextCell = cellB1.getNextDataCell(SpreadsheetApp.Direction.DOWN);
      const detectedRow = nextCell.getRow();
      if (detectedRow > 0 && detectedRow <= sheet.getMaxRows()) {
        if (sheet.getRange(detectedRow, 2).getValue() !== "") {
          lastRow = detectedRow;
        }
      }
    } catch (e) {
      lastRow = Math.max(1, sheet.getLastRow());
    }

    // 3. 重複防止チェック②: 直前行と全く同じデータの連続追加を検知（直近1行のみ取得で超軽量）
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

    // シートの物理的な最大行数に達した場合は自動で行を追加
    if (newRow > sheet.getMaxRows()) {
      sheet.insertRowAfter(sheet.getMaxRows());
    }

    // 4. データ書き込み（B〜G列: 日付、立替、カテゴリ、店舗、備考）
    sheet.getRange(newRow, 2, 1, 6).setValues([payload.slice(1, 7)]);

    // 5. 精算フラグ（I列）
    const categoryName = payload[4];
    const isSettled = (categoryName === "泰雅財布入金" || categoryName === "泰雅精算ログ") ? true : false;
    sheet.getRange(newRow, 9).setValue(isSettled);

    // 6. 成功リクエストIDをキャッシュに記録（10分間保持）
    if (requestId) {
      cache.put("kakeibo_req_" + requestId, "done", 600);
    }

    // 7. 新規カテゴリや店舗がマスターシートに未登録の場合のみ末尾にピンポイント追記
    const masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("マスター");
    if (masterSheet) {
      const categoryToRegister = String(payload[4] || "").trim();
      const storeToRegister = String(payload[5] || "").trim();

      if (categoryToRegister || storeToRegister) {
        const masterLastRow = masterSheet.getLastRow();
        if (masterLastRow > 1) {
          const masterData = masterSheet.getRange(2, 1, masterLastRow - 1, 2).getValues();
          const existingCategories = masterData.map(r => String(r[0] || "").trim()).filter(Boolean);
          const existingStores = masterData.map(r => String(r[1] || "").trim()).filter(Boolean);

          if (categoryToRegister && !existingCategories.includes(categoryToRegister)) {
            masterSheet.getRange(existingCategories.length + 2, 1).setValue(categoryToRegister);
          }
          if (storeToRegister && !existingStores.includes(storeToRegister)) {
            masterSheet.getRange(existingStores.length + 2, 2).setValue(storeToRegister);
          }
        }
      }
    }

    return generateResponse({
      status: "success",
      message: "Row appended successfully!"
    });
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
