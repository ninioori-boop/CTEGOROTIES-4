@echo off
chcp 65001 >nul
cd /d "%~dp0"
git add .
git commit -m "חיזוק זיהוי תשלומים בדוח מיפוי"
git push origin main
pause
