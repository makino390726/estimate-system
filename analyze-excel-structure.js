const XLSX = require('xlsx');
const path = require('path');

const filePath = 'c:\\Users\\S002\\Downloads\\Ｒ８年度見積書-20260106T001252Z-3-001\\Ｒ８年度見積書\\南九州営業所  001~100\\025見積書(市来農芸高校　天窓制御盤、換気扇、遮光材).xlsx';

console.log('=== Excel File Structure Analysis ===\n');
console.log('File:', filePath);
console.log('Exists:', require('fs').existsSync(filePath) ? 'YES' : 'NO\n');

if (!require('fs').existsSync(filePath)) {
  console.error('File not found!');
  process.exit(1);
}

try {
  const wb = XLSX.readFile(filePath);
  
  console.log('\n--- Sheet Names ---');
  wb.SheetNames.forEach((name, idx) => {
    console.log(`[${idx}] "${name}"`);
  });

  // 最初の3シートを分析
  wb.SheetNames.slice(0, 3).forEach((sheetName, sheetIdx) => {
    const ws = wb.Sheets[sheetName];
    console.log(`\n--- Sheet: "${sheetName}" ---`);
    
    // シートの範囲を取得
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const maxRow = range.e.r + 1;
    const maxCol = range.e.c + 1;
    
    console.log(`Dimensions: ${maxCol} columns × ${maxRow} rows`);
    console.log(`Cell range: ${ws['!ref']}`);
    
    // 最初の15行を表示
    console.log('\nFirst 15 rows (A-J columns):');
    for (let row = 0; row < Math.min(15, maxRow); row++) {
      const rowData = [];
      for (let col = 0; col < Math.min(10, maxCol); col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = ws[cellAddr];
        const val = cell ? String(cell.v ?? '').substring(0, 20) : '';
        rowData.push(`${val}`.padEnd(20));
      }
      console.log(`Row ${String(row + 1).padStart(3)}: ${rowData.join(' | ')}`);
    }

    // 結合セル情報
    if (ws['!merges'] && ws['!merges'].length > 0) {
      console.log(`\nMerged cells: ${ws['!merges'].length} total`);
      ws['!merges'].slice(0, 5).forEach((merge, idx) => {
        const range = XLSX.utils.encode_range(merge);
        console.log(`  [${idx}] ${range}`);
      });
    }
  });

} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
