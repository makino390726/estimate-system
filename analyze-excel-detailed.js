const XLSX = require('xlsx');

const filePath = 'c:\\Users\\S002\\Downloads\\Ｒ８年度見積書-20260106T001252Z-3-001\\Ｒ８年度見積書\\南九州営業所  001~100\\025見積書(市来農芸高校　天窓制御盤、換気扇、遮光材).xlsx';

console.log('=== Detailed Excel Analysis ===\n');

const wb = XLSX.readFile(filePath);

// 各シートの詳細確認
wb.SheetNames.forEach((sheetName, idx) => {
  const ws = wb.Sheets[sheetName];
  console.log(`\n========== Sheet [${idx}]: "${sheetName}" ==========`);
  
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const maxRow = range.e.r;
  
  // 40行目を確認（ヘッダー）
  console.log('\n--- Row 40 (expected header) ---');
  for (let col = 0; col < 20; col++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 39, c: col });
    const cell = ws[cellAddr];
    const val = cell ? String(cell.v ?? '') : '';
    if (val) {
      const colLetter = XLSX.utils.encode_col(col);
      console.log(`${colLetter}40: "${val}"`);
    }
  }
  
  // 41行目以降のデータ（最初の10行）
  console.log('\n--- Data rows 41-50 (Row | Col A | Col B | Col C | Col D) ---');
  for (let row = 40; row < 50; row++) {
    const a = ws[XLSX.utils.encode_cell({ r: row, c: 0 })]?.v ?? '';
    const b = ws[XLSX.utils.encode_cell({ r: row, c: 1 })]?.v ?? '';
    const c = ws[XLSX.utils.encode_cell({ r: row, c: 2 })]?.v ?? '';
    const d = ws[XLSX.utils.encode_cell({ r: row, c: 3 })]?.v ?? '';
    console.log(`Row ${row+1}: "${String(a).substring(0,15)}" | "${String(b).substring(0,15)}" | "${String(c).substring(0,15)}" | "${String(d).substring(0,15)}"`);
  }
  
  // 2行目も確認（もしかしたらここがヘッダー？）
  console.log('\n--- Row 2 content ---');
  for (let col = 0; col < 15; col++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 1, c: col });
    const cell = ws[cellAddr];
    const val = cell ? String(cell.v ?? '') : '';
    if (val) {
      const colLetter = XLSX.utils.encode_col(col);
      console.log(`${colLetter}2: "${val}"`);
    }
  }
});
