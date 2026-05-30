const fs = require('fs');
const content = fs.readFileSync('node_modules/react-zoom-pan-pinch/dist/index.esm.js', 'utf8');
const wheelMatches = content.match(/.{0,50}wheelDisabled.{0,50}/g);
console.log(wheelMatches);
