function updateMermaidFontFamily(code, fontString) {
    const regex = /^---\nconfig:\n([\s\S]*?)\n---\n/m;
    const match = code.match(regex);
    if (match) {
        let configBlock = match[1];
        
        // Update top-level fontFamily
        // We only want to match top-level, which means it starts after a newline and exactly 2 spaces
        const fontRegex = /(^|\n)  fontFamily:\s*[^\n]+/;
        if (fontRegex.test(configBlock)) {
            configBlock = configBlock.replace(fontRegex, `$1  fontFamily: '${fontString}'`);
        } else {
            configBlock += `\n  fontFamily: '${fontString}'`;
        }

        // Update themeVariables: fontFamily
        // match themeVariables block until next top-level property (2 spaces) or end of string
        const themeVarsRegex = /(^|\n)  themeVariables:([\s\S]*?)(?=\n  [a-zA-Z0-9]+:|$)/;
        const themeVarsMatch = configBlock.match(themeVarsRegex);
        
        if (themeVarsMatch) {
            let varsBlock = themeVarsMatch[2];
            // Replace fontFamily inside varsBlock. 
            // We should match 4 spaces followed by fontFamily
            if (/\n    fontFamily:\s*[^\n]+/.test(varsBlock)) {
                varsBlock = varsBlock.replace(/\n    fontFamily:\s*[^\n]+/, `\n    fontFamily: '${fontString}'`);
            } else {
                varsBlock = varsBlock.replace(/\n*$/, `\n    fontFamily: '${fontString}'\n`);
            }
            configBlock = configBlock.replace(themeVarsRegex, `$1  themeVariables:${varsBlock}`);
        } else {
            configBlock += `\n  themeVariables:\n    fontFamily: '${fontString}'`;
        }
        
        return code.replace(regex, `---\nconfig:\n${configBlock}\n---\n`);
    } else {
        return `---\nconfig:\n  fontFamily: '${fontString}'\n  themeVariables:\n    fontFamily: '${fontString}'\n---\n` + code;
    }
}

let code = `---
config:
  fontFamily: '"Recursive Variable", sans-serif'
  themeVariables:
    fontFamily: '"Recursive Variable", sans-serif'
---
graph TD
A`;

let pass1 = updateMermaidFontFamily(code, '"Open Sans Variable", sans-serif');
console.log("Pass 1:");
console.log(pass1);

let pass2 = updateMermaidFontFamily(pass1, '"Inter Variable", sans-serif');
console.log("Pass 2:");
console.log(pass2);

