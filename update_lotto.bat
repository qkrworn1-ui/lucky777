@echo off
echo ==============================================
echo        Lotto Winning Numbers Auto-Updater
echo ==============================================
echo Running python script to fetch the latest draw...
echo.

python update_lotto.py

echo.
echo Process complete. Press any key to close this window.
pause > nul
