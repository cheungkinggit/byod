# BYOD iPad 抽查系統

手機優先的 Google Apps Script 網頁，程式碼保存在 GitHub，學生資料只寫入學校控制的 Google Sheet。相片中的[工作指引文字版](WORK_GUIDE.md)已放到每頁底部的可收合區塊；預設收起。

## 功能

- 管理員按日期、時間及年級建立行動，指定統籌、每班老師、學生名單及各班抽查人數（預設五人）。
- 老師只讀寫自己獲指派班別的學生資料；同一行動的所有負責老師可看各班完成進度。
- 隨機抽樣；學生缺席可重抽並保留替換記錄；已有檢查結果的學生不能標記缺席。
- 記錄「沒有問題」或四種問題、檢查備註，以及需否跟進、跟進日期和備註。
- 統籌及管理員可查看整體報告，用瀏覽器列印／另存 PDF；結束後仍可翻查，必要時重新開啟。內容太長的報告可能超過一頁。
- 頁面每 20 秒更新其他老師的進度；正編輯欄位時暫緩刷新，以免清除輸入。

## 部署（由學校 Google Workspace 管理帳戶操作）

1. 在學校 Drive 建立一個**只有系統擁有人可以存取**的 Google Sheet，複製試算表 ID。老師無須直接取得 Sheet 權限。
2. 在 [script.google.com](https://script.google.com/) 建立獨立 Apps Script 專案。把 repository 根目錄 中的 `Code.gs`、`Index.html`、`Styles.html`、`Client.html` 和 `appsscript.json` 複製到相同名稱的檔案。HTML 三個檔案在編輯器選「HTML」類型；`appsscript.json` 在專案設定開啟顯示資訊清單後編輯。
3. 在 **專案設定 → 指令碼屬性**設定：`SPREADSHEET_ID`＝試算表 ID、`SCHOOL_DOMAIN`＝學校 Google Workspace 網域（例如 `school.edu.hk`，不包含 @）、`ADMIN_EMAILS`＝一個或多個管理員的學校電郵，以英文逗號分隔。不要將這些資料加入公開 GitHub 程式碼。
4. 用管理員帳戶在 Apps Script 編輯器執行 `initializeStorage` 一次並授權。它會建立 `Actions`、`Assignments`、`Records` 三個工作表。
5. **部署 → 新部署 → 網頁應用程式**：執行身分選「我」；可存取對象選「機構內所有使用者」。部署者必須與老師屬於同一 Google Workspace 網域。複製部署後的 `/exec` 網址予負責老師。
6. 先用虛構學生測試兩個教師帳戶、統籌帳戶、缺席重抽、報告和權限，再放入真實資料。更新程式後須建立新部署版本。

## 身分辨識限制

Apps Script 使用 `Session.getActiveUser().getEmail()` 辨認老師；Google 說明指出「以我執行」的網頁應用程式在某些情況會回傳空白電郵，而部署者與使用者同屬一個 Workspace 網域時一般不受這個限制。系統在電郵空白或網域不符時會**拒絕讀寫**。如學校使用跨網域／個人 Gmail 帳戶，這套部署設定不適用，需先改用另一種經驗證的登入及資料架構。學校應先測試實際教師帳戶。

## 資料與權限

每個伺服器操作都重新核對 Google 帳戶：管理員可建立行動；統籌可讀全級紀錄及結束行動；負責老師只可更新自己班別。Sheet 不直接分享予教師。程式以 Script Lock 避免同時寫入互相覆蓋。GitHub 不存放學生名單、報告或個人憑證；學校應自行訂立保存期限及備份安排。
