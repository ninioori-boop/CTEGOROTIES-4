@echo off
chcp 65001 >nul
cd /d "%~dp0"
git add index.html
git commit -m "mekateg: la gaterie food, headphone.com donations"
git push origin main
