require('dotenv').config();
const s = require('smartsheet');

console.log('Testing Smartsheet SDK Initialization...');

try {
  const client = s.createClient({accessToken: process.env.SMARTSHEET_TOKEN});
  console.log('Client created successfully.');

  const idToTest = process.env.SHEET_ID;
  if (!idToTest) {
    console.error('SHEET_ID not defined in environment variables.');
    process.exit(1);
  }

  console.log(`Testing getSheet with id: ${idToTest}`);
  client.sheets.getSheet({id: idToTest})
    .then(res => {
        console.log(`SUCCESS! Found sheet: "${res.name}" with ${res.rows?.length || 0} rows.`);
        process.exit(0);
    })
    .catch(e => {
        console.error("SDK Error when calling getSheet({id}):", e.message);
        process.exit(1);
    });

} catch (err) {
  console.error("Initialization Error:", err.message);
  process.exit(1);
}
