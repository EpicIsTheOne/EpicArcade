// quick check: bed block + recipe present
const { B, RECIPES } = require('../src/shared/blocks.js');
console.log('BED id:', B.BED, 'recipes:', RECIPES.length);
const bed = RECIPES.find(r => r.name === 'Bed');
console.log('bed recipe out:', JSON.stringify(bed && bed.out));
if (!bed) process.exit(1);
