MAXRIDE — EXACT PROTOTYPE + DRIVER SOUND FIX
===========================================

The package contains three things at its root/path:
  CODEX_EXECUTE_EXACT_PROTOTYPE.md
  SOURCE_MANIFEST.md
  design/reference/Maxride mobile app prototype.zip

INSTALLATION (Windows PowerShell)
-------------------------------
1. Download this ZIP to your Downloads folder.
2. Run in PowerShell (from any directory):

  $pkg = Get-ChildItem "$env:USERPROFILE\Downloads" -Filter "Maxride_MX036_MX045_DriverSound_Execution*.zip" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (!$pkg) { throw "Download the Maxride handoff ZIP first." }
  Expand-Archive -LiteralPath $pkg.FullName -DestinationPath 'D:\Kova' -Force
  if (!(Test-Path 'D:\Kova\CODEX_EXECUTE_EXACT_PROTOTYPE.md') -or !(Test-Path 'D:\Kova\design\reference\Maxride mobile app prototype.zip')) { throw "Handoff files missing after extraction" }
  Write-Host 'Handoff installed correctly in D:\Kova' -ForegroundColor Green

3. In EXISTING Codex session, say:

  Read D:\Kova\CODEX_EXECUTE_EXACT_PROTOTYPE.md fully and execute ALL MX-036, MX-045 and MX-046 tasks directly in D:\Kova. Fix sound controls on DRIVER, not just rider. Implement the actual prototype and admin CMS, run browser visual + E2E tests, commit, deploy, verify Render. No mockups. Do not stop at planning.

Nothing in this ZIP is a production software patch; it is the source prototype plus exact implementation brief. Only Codex's code changes and deployment will change the live app.
