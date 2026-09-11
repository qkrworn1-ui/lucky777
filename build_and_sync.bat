@echo off
chcp 65001 > nul
echo ========================================================
echo   Lucky777 자동 빌드, 버전 동기화 및 무결성 검증 도구
echo ========================================================
echo.
echo [1/3] 버전 에셋 동기화, 번들링 및 파이어베이스 푸시 실행 중...
python bundle.py %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] 빌드 실패! 오류를 확인하세요.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] 전체 시스템 및 무결성 테스트 실행 중...
python tests/test_full_system.py
python tests/test_integrity.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] 테스트 실패!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo  [3/3] 빌드 및 파이어베이스 실시간 동기화 완료!
echo  변경된 파일들을 GitHub에 push하시면 사용자에게 즉시 배포됩니다:
echo    git add .
echo    git commit -m "Update build"
echo    git push
echo ========================================================
echo.
pause
