const fs = require('fs');
const code = fs.readFileSync('node_modules/react-zoom-pan-pinch/dist/index.esm.js', 'utf8');

const m = code.match(/function isPanningAllowed.*?\n([\s\S]*?){([\s\S]*?)}/);
if (m) console.log(m[0]);
else {
  const m2 = code.match(/var isPanningAllowed[\s\S]*?{([\s\S]*?)}/);
  if (m2) console.log(m2[0]);
}
