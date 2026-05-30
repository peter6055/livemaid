function updateMermaidFontFamily(code, fontString) {
    const regex = /^---\nconfig:\n([\s\S]*?)\n---\n/m;
    const match = code.match(regex);
    if (match) {
        let configBlock = match[1];
        
        // Update top-level fontFamily
        const fontRegex = /fontFamily:\s*[^\n]+/;
        if (fontRegex.test(configBlock)) {
            configBlock = configBlock.replace(fontRegex, `fontFamily: '${fontString}'`);
        } else {
            configBlock += `\n  fontFamily: '${fontString}'`;
        }

        // Update themeVariables: fontFamily
        const themeVarsRegex = /themeVariables:\s*([\s\S]*?)(?=\n\s*[a-zA-Z0-9]+:|$)/;
        const themeVarsMatch = configBlock.match(themeVarsRegex);
        
        if (themeVarsMatch) {
            let varsBlock = themeVarsMatch[1];
            if (/fontFamily:\s*[^\n]+/.test(varsBlock)) {
                varsBlock = varsBlock.replace(/fontFamily:\s*[^\n]+/, `fontFamily: '${fontString}'`);
            } else {
                varsBlock = varsBlock.replace(/\n*$/, `\n    fontFamily: '${fontString}'\n`);
            }
            configBlock = configBlock.replace(themeVarsRegex, `themeVariables:\n${varsBlock}`);
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

