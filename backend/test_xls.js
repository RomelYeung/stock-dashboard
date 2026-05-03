import * as xlsx from 'xlsx';

async function test() {
  try {
    const res = await fetch('https://www.aaii.com/files/surveys/sentiment.xls', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const buffer = await res.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // raw: false forces formatted strings
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
    
    for (let i = 5; i < 15; i++) {
        console.log(`Row ${i}:`, JSON.stringify(data[i]));
    }
  } catch(e) {
    console.error(e);
  }
}
test();
