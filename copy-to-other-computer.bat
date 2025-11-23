@echo off
echo ========================================
echo Quotation App - Copy to Other Computer
echo ========================================
echo.

set DEST=D:\QuotationApp_Deploy

echo Creating deployment folder...
mkdir "%DEST%" 2>nul

echo.
echo Copying Frontend...
xcopy /E /I /Y "frontend\src" "%DEST%\frontend\src\"
xcopy /E /I /Y "frontend\public" "%DEST%\frontend\public\"
copy /Y "frontend\package.json" "%DEST%\frontend\"
copy /Y "frontend\.env" "%DEST%\frontend\"

echo.
echo Copying Backend Migration Scripts...
copy /Y "create-payment-terms-table.js" "%DEST%\backend\"
copy /Y "create-product-favorites-table.js" "%DEST%\backend\"
copy /Y "create-quote-events-table.js" "%DEST%\backend\"
copy /Y "create-approval-workflow-table.js" "%DEST%\backend\"
copy /Y "update-customers-table.js" "%DEST%\backend\"

echo.
echo Copying Documentation and Templates...
copy /Y "PRODUCT-IMPORT-README.md" "%DEST%\"
copy /Y "CSV-IMPORT-GUIDE.md" "%DEST%\"
copy /Y "TEMPLATE-USAGE-GUIDE.md" "%DEST%\"
copy /Y "import-products.html" "%DEST%\"
copy /Y "new-manufacturer-template.csv" "%DEST%\"
copy /Y "product-import-template.csv" "%DEST%\"

echo.
echo ========================================
echo Copy Complete!
echo ========================================
echo.
echo Files copied to: %DEST%
echo.
echo Next steps:
echo 1. Copy the folder to USB drive or other computer
echo 2. On other computer, run: npm install in frontend folder
echo 3. Update .env file with correct API URL
echo 4. Run migration scripts in backend folder
echo 5. Start frontend: npm start
echo.
pause
