const XLSX = require('xlsx');
const path = require('path');

const filePath = 'c:\\Users\\S002\\Downloads\\Ｒ８年度見積書-20260106T001252Z-3-001\\Ｒ８年度見積書\\南九州営業所  001~100\\016見積書(鹿児島ビニール　SK-300L-UF).xlsx';

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  console.log('=== SHEET ANALYSIS ===\n');
  console.log(`Sheet: ${sheetName}`);
  console.log(`Sheet Names: ${workbook.SheetNames.join(', ')}\n`);
  
  // セル範囲を指定して値を取得
  console.log('=== METADATA AREA (Rows 1-40) ===\n');
  
  // 列A～M、行1～40のセル値を表示
  for (let row = 1; row <= 40; row++) {
    const rowData = [];
    for (let col = 0; col < 13; col++) { // A～M
      const cellAddress = XLSX.utils.encode_cell({ r: row - 1, c: col });
      const cell = sheet[cellAddress];
      const value = cell ? (cell.v !== undefined ? cell.v : '') : '';
      if (value) {
        const colLetter = String.fromCharCode(65 + col);
        rowData.push(`${colLetter}${row}="${value}"`);
      }
    }
    if (rowData.length > 0) {
      console.log(`Row ${row}: ${rowData.join(', ')}`);
    }
  }
  
  console.log('\n=== DETAIL HEADER (Row 40-42) ===\n');
  for (let col = 0; col < 30; col++) { // A～AD
    const colLetter = String.fromCharCode(65 + (col % 26)) + (col >= 26 ? String.fromCharCode(65 + Math.floor(col / 26) - 1) : '');
    const cellAddress = XLSX.utils.encode_cell({ r: 39, c: col }); // Row 40
    const cell = sheet[cellAddress];
    const value = cell ? (cell.v !== undefined ? cell.v : '') : '';
    if (value) {
      console.log(`${cellAddress} = "${value}"`);
    }
  }
  
  console.log('\n=== DATA ROWS (Row 41-60) ===\n');
  for (let row = 41; row <= 60; row++) {
    const cellA = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 3 })]; // D
    const cellD = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 43 })]; // AR
    const nameVal = cellA ? cellA.v : '';
    const priceVal = cellD ? cellD.v : '';
    if (nameVal || priceVal) {
      console.log(`Row ${row}: D="${nameVal}", AR="${priceVal}"`);
    }
  }
  
} catch (error) {
  console.error('Error:', error.message);
}
