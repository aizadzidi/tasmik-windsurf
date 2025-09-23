// Debug script to check ZARA SOFEA's data
const fetch = require('node-fetch');

async function checkData() {
  try {
    const response = await fetch('http://localhost:3000/api/admin/exams');
    const data = await response.json();
    
    const zara = data.students.find(s => s.name === "ZARA SOFEA BINTI AIRUL ADIBA");
    
    if (zara) {
      console.log("Found ZARA SOFEA:");
      console.log("- Name:", zara.name);
      console.log("- Class:", zara.class);
      console.log("- Has subjects?:", !!zara.subjects);
      console.log("- Subject keys:", Object.keys(zara.subjects || {}));
      console.log("- Full subjects data:", JSON.stringify(zara.subjects, null, 2));
      
      // Check what the component would see
      console.log("\n--- What StudentDetailsPanel would see ---");
      console.log("Object.entries(zara.subjects):", Object.entries(zara.subjects || {}));
      console.log("Number of subjects:", Object.entries(zara.subjects || {}).length);
    } else {
      console.log("ZARA SOFEA not found in data");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

checkData();