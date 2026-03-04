@echo off
chcp 65001 >nul
cd /d "c:\Users\ninio\OneDrive\B7A3~1\CTEGOROTIES-4-main"

echo מעלה את המקטרג ל-GitHub...
git add .
git status
git commit -m "תיקון תשלומים: סכום חודשי + נותרו | KSP לתקשורת | טוקינג גלובל לחינוך"
git push origin main

echo.
echo הושלם!
pause
