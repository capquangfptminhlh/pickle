@echo off
chcp 65001 > nul
title Pickle Tour - Zalo CRM Tournament Auto-Sync ^& Banner OCR
echo ===================================================================
echo   🏓 PICKLE TOUR - ZALO CRM AUTO-SYNC ^& BANNER OCR WATCHER
echo ===================================================================
echo   Dang ket noi database LHM CRM va lang nghe tin nhan / poster moi...
echo.

cd /d "%~dp0"
python scripts\sync_zalo_tournaments.py --watch --interval 15

pause
