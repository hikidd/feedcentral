const fs = require('fs');
const path = require('path');

// Ensure Prisma query engine binary is in the correct location for Vercel
const prismaClientPath = path.join(__dirname, '..', 'node_modules', '.prisma', 'client');
const prismaEnginePatterns = [
  /^libquery_engine-.*\.node$/,
  /^query_engine-.*\.node$/,
];

console.log('🔍 Checking Prisma query engine binaries...');
console.log('📂 Prisma client path:', prismaClientPath);

if (fs.existsSync(prismaClientPath)) {
  const files = fs.readdirSync(prismaClientPath);
  const engineFiles = files.filter((file) => prismaEnginePatterns.some((pattern) => pattern.test(file)));
  
  console.log('✅ Found Prisma query engine binaries:', engineFiles);
  
  if (engineFiles.length === 0) {
    console.error('❌ No Prisma query engine binaries found!');
    process.exit(1);
  }
} else {
  console.error('❌ Prisma client path does not exist!');
  process.exit(1);
}

console.log('✅ Prisma binaries check passed');
