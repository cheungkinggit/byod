# GitHub Pages 版本部署

公開入口是 https://cheungkinggit.github.io/byod/ 。目前入口仍導向原有網頁；先更新後端，再切換 GitHub Pages 入口，可避免老師在過渡期間遇到無法登入的畫面。

## 1. 更新現有 Apps Script 專案

在現有專案中：

1. 以本倉庫的 [Code.gs](Code.gs) **完整取代**專案內的 Code.gs。
2. 新增一個名為 Bridge 的 HTML 檔，貼入本倉庫 [Bridge.html](Bridge.html) 的完整內容。Apps Script 會顯示檔名 Bridge.html。
3. 保留目前 Index.html；這是原有網址的備用畫面。
4. 儲存後，到 **部署 → 管理部署作業 → 編輯現有網頁部署 → 建立新版本 → 部署**。請更新現有部署，不要另建新的部署網址，否則 GitHub 頁面內的背景連線網址也要同步修改。
5. 保持原本的執行身分、存取設定及指令碼屬性。不要把密碼、雜湊、學生資料或試算表 ID 放入 GitHub。

完成後通知維護者，才進行下一步。

## 2. 切換 GitHub Pages 入口

把本倉庫的 [_pages-next.html](_pages-next.html) 內容複製到根目錄 [index.html](index.html)，取代現有跳轉頁。GitHub Pages 會自動發布，無需改 Pages 設定。

## 3. 驗證

- 開啟 https://cheungkinggit.github.io/byod/ ，確認網址列仍是 github.io/byod/、顯示登入畫面，且沒有帳號提示或平台橫幅。
- 用測試資料核對管理員登入、名單、建立行動、抽籤、教師儲存、缺席重抽及報告。
- 用兩部裝置核對更新同步。測試時避免修改真實學生紀錄。

背景連線頁只接受來自 https://cheungkinggit.github.io 的訊息；所有資料操作仍由伺服器檢查登入工作階段及權限。GitHub Pages 只放畫面程式，不存放學生名單或報告。
