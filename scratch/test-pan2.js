const fs = require('fs');
const code = fs.readFileSync('node_modules/react-zoom-pan-pinch/dist/index.esm.js', 'utf8');

const m = code.match(/function isPanningAllowed.*?{([\s\S]*?)}/);
if (m) console.log(m[0]);

const m2 = code.match(/function handlePanningStart.*?{([\s\S]*?)}/);
if (m2) console.log(m2[0]);
