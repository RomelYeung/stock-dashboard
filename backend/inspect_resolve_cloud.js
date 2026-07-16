import fs from 'fs';
import path from 'path';

// Let's find resolveCloudFlag in node_modules/@google/genai
const genaiDir = './node_modules/@google/genai';

function searchFile(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      searchFile(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('resolveCloudFlag')) {
        console.log(`Found in ${fullPath}:`);
        const lines = content.split('\n');
        const index = lines.findIndex(line => line.includes('function resolveCloudFlag'));
        if (index !== -1) {
          console.log(lines.slice(index, index + 20).join('\n'));
        } else {
          console.log("Found reference but not function definition.");
        }
      }
    }
  }
}

searchFile(genaiDir);
