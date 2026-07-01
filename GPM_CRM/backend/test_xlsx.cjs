const fs = require('fs');
const path = require('path');
const FILE = path.resolve('..','..','CRM','FUNIL_MDO_corrigido.xlsx');
console.log('TEST: filepath', FILE);
try{
  const st = fs.statSync(FILE);
  console.log('TEST: size', st.size);
} catch(e){
  console.error('TEST: stat_error', e.message);
}
try{
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(FILE);
  console.log('TEST: sheets', wb.SheetNames);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {defval: ''});
  console.log('TEST: rows', rows.length);
  console.log('TEST: headers', JSON.stringify(rows.length?Object.keys(rows[0]):[]));
  console.log('TEST: first5', JSON.stringify(rows.slice(0,5)));
} catch(err){
  console.error('TEST_ERROR', err && err.message);
}
