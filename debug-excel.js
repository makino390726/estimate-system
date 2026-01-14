const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\S002\\Downloads\\Ｒ８年度見積書-20260106T001252Z-3-001\\Ｒ８年度見積書\\南九州営業所  001~100\\002見積書(興農園　さかうえ　暖房機、重油配管).xlsx';

try {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellFormula: false, cellStyles: false });
  
  console.log('=== WORKBOOK INFO ===');
  console.log('Sheet names:', wb.SheetNames);
  
  // 各シートを確認
  wb.SheetNames.forEach((sheetName, idx) => {
    console.log(`\n=== SHEET ${idx}: "${sheetName}" (rows 1-40) ===`);
    const ws = wb.Sheets[sheetName];
    
    for (let r = 1; r <= 40; r++) {
      const rowData = [];
      for (let c = 0; c < 26; c++) {
        const col = String.fromCharCode(65 + c);
        const cellAddr = col + r;
        const cell = ws[cellAddr];
        const value = cell?.v ?? '';
        if (value) {
          rowData.push(`${col}:${value}`);
        }
      }
      if (rowData.length > 0) {
        console.log(`Row${r}: ${rowData.join(', ')}`);
      }
    }
  });
  
} catch (err) {
  console.error('Error:', err.message);
  console.error(err.stack);
}
