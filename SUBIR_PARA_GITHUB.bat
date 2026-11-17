@echo off
title ENVIANDO CASH BOT PARA O GITHUB
color 0A
cd /d C:\Users\dpz\Desktop\cashbot-studio
echo ========================================================
echo     ENVIANDO PROJETO CASH BOT PARA O SEU GITHUB
echo ========================================================
echo.
echo Autorize na janela que vai abrir a seguir no navegador...
echo.
"C:\Program Files\Git\cmd\git.exe" push -u origin main --force
echo.
echo ========================================================
echo     CONCLUIDO COM SUCESSO!
echo ========================================================
pause
