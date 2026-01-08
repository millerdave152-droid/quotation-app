/**
 * Script to generate logo module from image file
 * Run with: node generate-logo.js
 */
const fs = require('fs');
const path = require('path');

const logoPath = 'C:/Users/WD-PC1/OneDrive/Desktop/teletime logo.png';
const outputPath = path.join(__dirname, '../assets/teletimeLogo.js');

try {
  const data = fs.readFileSync(logoPath);
  const base64 = 'data:image/png;base64,' + data.toString('base64');

  const moduleContent = `// Teletime Logo - Auto-generated
// This file contains the base64-encoded company logo for PDF generation
// DO NOT EDIT MANUALLY - regenerate using generate-logo.js

const TELETIME_LOGO = "${base64}";

export default TELETIME_LOGO;
`;

  fs.writeFileSync(outputPath, moduleContent);
  console.log('Logo module created successfully at:', outputPath);
  console.log('Base64 length:', base64.length);
} catch (err) {
  console.error('Error:', err.message);
}
