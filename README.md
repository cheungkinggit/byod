# BYOD iPad 抽查系統

手機優先的 Google Apps Script 網頁。前端只有一個 [`Index.html`](Index.html)，內含畫面、樣式及互動；[`Code.gs`](Code.gs) 處理密碼核對、權限及資料同步。學生資料只寫入學校控制的 Google Sheet。相片中的[工作指引文字版](WORK_GUIDE.md)已放到每頁底部的可收合區塊；預設收起。

手機可用 Safari 或 Chrome 開啟[公開網頁連結](https://script.google.com/macros/s/AKfycbzwfTjtVa1KhvBHLmSpYCx2YGazh6lIhqcJX8rSvbBq0lyVfjhxXc_caZEdUAJ9Mj1kFw/exec)，毋須先登入學校 Google 帳戶。**公開網址目前仍是舊部署**；GitHub 原始碼更新後，必須把新版 `Code.gs`、`Index.html` 儲存到 Apps Script 專案，並建立新部署版本，才會生效。

## 功能

- 管理員按日期、時間及年級建立行動，可從私人資料表帶入整級班別、學生名單與班主任，再調整負責老師及各班抽查人數（預設五人）。
- 管理員可在「名單管理」逐班更新學生學號與姓名，亦可修改、加入或移除教師資料；變更供新行動使用，已建立行動的名單及指派保留原有快照。
- 同一個網頁有兩種版面。管理者以 `admin` 加管理者密碼登入，建立行動、指派班別和老師、設定每班抽查人數，並在行動內替每班隨機抽籤；使用者以 `byod` 加使用者密碼登入，選自己姓名後處理獲指派的班別。兩組密碼只在伺服器核對，原文不可加入公開程式碼。
- 學生缺席時負責老師可重抽並保留替換記錄；已有檢查結果的學生不能標記缺席。
- 記錄「沒有問題」或四種問題、檢查備註，以及需否跟進、跟進日期和備註。
- 統籌及管理員可查看整體報告，用瀏覽器列印／另存 PDF；結束後仍可翻查，必要時重新開啟。內容太長的報告可能超過一頁。
- 多位老師可同時使用：各手機有獨立工作階段，寫入由 Apps Script Script Lock 序列化。登入直接傳回首屏資料；共用資料短暫快取，寫入後清除舊版本；頁面在可見且沒有編輯時每 45 秒更新其他老師進度。

## 部署（由學校 Google Workspace 管理帳戶操作）

1. 在學校 Drive 建立一個**只有系統擁有人可以存取**的 Google Sheet，複製試算表 ID。老師無須直接取得 Sheet 權限。
2. 在 [script.google.com](https://script.google.com/) 建立 Apps Script 專案。把 `Code.gs` 貼到程式碼檔，並建立一個名為 `Index.html` 的 HTML 檔，貼入 `Index.html`。不需要前端框架、建置工具或另外的 CSS／JavaScript 檔案；`appsscript.json` 可按需要複製。
3. 在 **專案設定 → 指令碼屬性**設定 `SPREADSHEET_ID`、`PASSWORD_SALT`、`ADMIN_PASSWORD_HASH`、`TEACHER_PASSWORD_HASH`。兩組密碼必須不同，至少 8 字；產生隨機鹽及密碼，再計算 `base64(SHA-256(鹽 + 密碼))`，只儲存雜湊。不要將鹽、雜湊或原始密碼加入公開 GitHub。
4. 試算表有 `Actions`、`Assignments`、`Records`、`Students`、`Teachers` 五個工作表。`Students` 只填 `class`、`number`、`name`；`Teachers` 只填 `name`、選填的 `defaultClass`。名單留在私人 Sheet，**不要提交到 GitHub**。
5. **部署 → 管理部署作業 → 編輯 → 建立新版本**：網頁應用程式執行身分選「我」；可存取對象選「任何人」。Google Workspace 管理員可能需要容許這個選項。複製 `/exec` 網址予老師，將教師密碼另行安全傳達；管理員密碼只交予管理員。
6. 用虛構學生測試老師和管理員登入、抽查、報告和權限。更新程式後須建立新部署版本。

## 身分辨識限制

網頁不要求 Google 帳戶登入。密碼經伺服器核對後發出最多六小時的工作階段；關閉分頁會清除瀏覽器內的工作階段。使用者帳戶是共用密碼，登入者可以選擇任何已獲指派的老師姓名，因此**不能用它核實真實身分**。若需要逐人核實，日後須改成每位教師獨立密碼。密碼流出時應立即更換。請勿把學生資料或密碼公開分享。

## 資料與權限

每個伺服器操作都核對工作階段及角色：管理員可建立、抽籤及結束行動；統籌可讀全級紀錄；選取的負責老師可更新自己班別。Sheet 不直接分享予教師。程式以 Script Lock 避免同時寫入互相覆蓋。GitHub 不存放學生名單、報告或個人憑證；學校應自行訂立保存期限及備份安排。
