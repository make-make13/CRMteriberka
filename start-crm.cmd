@echo off
:: ============================================================
::  CRM Большая Медведица — запуск в production-режиме
::
::  Требования:
::    - Node.js 18+  (node -v)
::    - npm install  (однократно после получения обновления)
::    - npm run build (однократно после получения обновления)
::
::  Для смены порта: задайте переменную PORT перед запуском
::    set PORT=3010
::  Или добавьте PORT=3010 в файл .env.local
:: ============================================================

cd /d "%~dp0"

:: Проверка: собрана ли frontend-часть
if not exist "dist\index.html" (
  echo.
  echo  [!] Папка dist\ не найдена.
  echo      Перед первым запуском выполните:  npm run build
  echo.
  pause
  exit /b 1
)

:: Определяем порт (читаем из .env.local если есть, иначе 3002)
set CRM_PORT=3002
for /f "usebackq tokens=1,* delims==" %%A in (".env.local") do (
  if /i "%%A"=="PORT" set CRM_PORT=%%B
)

set NODE_ENV=production

echo.
echo  ============================================================
echo   CRM Большая Медведица
echo   http://localhost:%CRM_PORT%
echo  ============================================================
echo.
echo  Запуск сервера...

:: Открываем браузер с задержкой 4 секунды (пока сервер стартует)
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:%CRM_PORT%"

:: Запускаем CRM (блокирующий вызов — окно остаётся открытым)
npm run start

echo.
echo  Сервер остановлен.
pause
