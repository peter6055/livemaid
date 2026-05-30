const fs = require('fs');
const code = fs.readFileSync('scratch/old_editor.tsx', 'utf8');

const m = code.match(/const handleAddNodeFromSelected = \(\) => {[\s\S]*?};/);
if (m) console.log(m[0]);
