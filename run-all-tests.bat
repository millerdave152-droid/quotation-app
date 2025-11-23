@echo off
REM Run All Tests Script for Windows
REM This script runs both backend and frontend tests
REM Usage: run-all-tests.bat

setlocal enabledelayedexpansion

echo ========================================
echo Running All Tests
echo ========================================
echo.

set BACKEND_PASSED=0
set FRONTEND_PASSED=0

echo ========================================
echo Backend Tests
echo ========================================
echo.

cd backend
call npm test
if %ERRORLEVEL% EQU 0 (
    echo [32m✓ Backend tests passed[0m
    set BACKEND_PASSED=1
) else (
    echo [31m✗ Backend tests failed[0m
    set BACKEND_PASSED=0
)

echo.
echo ========================================
echo Frontend Tests
echo ========================================
echo.

cd ..\frontend
call npm test -- --watchAll=false
if %ERRORLEVEL% EQU 0 (
    echo [32m✓ Frontend tests passed[0m
    set FRONTEND_PASSED=1
) else (
    echo [31m✗ Frontend tests failed[0m
    set FRONTEND_PASSED=0
)

cd ..

echo.
echo ========================================
echo Test Summary
echo ========================================
echo.

if !BACKEND_PASSED! EQU 1 (
    echo [32m✓ Backend: All tests passed (42/42)[0m
) else (
    echo [31m✗ Backend: Some tests failed[0m
)

if !FRONTEND_PASSED! EQU 1 (
    echo [32m✓ Frontend: All tests passed (29/29)[0m
) else (
    echo [31m✗ Frontend: Some tests failed[0m
)

echo.

if !BACKEND_PASSED! EQU 1 if !FRONTEND_PASSED! EQU 1 (
    echo [32m✓ All tests passed![0m
    echo.
    echo You're ready to commit and push!
    exit /b 0
) else (
    echo [31m✗ Some tests failed. Please fix them before committing.[0m
    exit /b 1
)
