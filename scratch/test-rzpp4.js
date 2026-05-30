const fs = require('fs');
const content = fs.readFileSync('node_modules/react-zoom-pan-pinch/dist/index.esm.js', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
    if (l.includes('trackPadPanning: {') || (l.includes('trackPadPanning') && l.includes('disabled'))) {
        console.log(`Line ${i}: ${l}`);
    }
});
