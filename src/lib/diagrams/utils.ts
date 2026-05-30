export function updateMermaidTheme(code: string, newTheme: string): string {
    const regex = /^---\nconfig:\n([\s\S]*?)\n---\n/m;
    const match = code.match(regex);
    if (match) {
        let configBlock = match[1];
        if (/theme:\s*(?:'|")[^'"]+(?:'|")/.test(configBlock)) {
            configBlock = configBlock.replace(/theme:\s*(?:'|")[^'"]+(?:'|")/, `theme: '${newTheme}'`);
        } else if (/theme:\s*[^\s\n]+/.test(configBlock)) {
            configBlock = configBlock.replace(/theme:\s*[^\s\n]+/, `theme: ${newTheme}`);
        } else {
            configBlock += `\n  theme: ${newTheme}`;
        }
        return code.replace(regex, `---\nconfig:\n${configBlock}\n---\n`);
    } else {
        return `---\nconfig:\n  theme: ${newTheme}\n---\n` + code;
    }
}

export function determineDiagramType(sourceCode: string): string {
    const lines = sourceCode.split('\n');
    let inConfig = false;
    for (const line of lines) {
       const trimmed = line.trim();
       if (trimmed === '---') {
          inConfig = !inConfig;
          continue;
       }
       if (inConfig || trimmed.startsWith('%%') || trimmed === '') continue;
       
       if (trimmed.startsWith('flowchart') || trimmed.startsWith('graph')) return 'flowchart';
       if (trimmed.startsWith('sequenceDiagram')) return 'sequence';
       
       const match = trimmed.match(/^([a-zA-Z]+)/);
       if (match) return match[1];
    }
    return 'flowchart';
}

export function updateMermaidConfigProperty(code: string, property: string, value: string): string {
    const regex = /^---\nconfig:\n([\s\S]*?)\n---\n/m;
    const match = code.match(regex);
    if (match) {
        let configBlock = match[1];
        const propRegex = new RegExp(`${property}:\\s*(?:'|")?[^'"\\n]+(?:'|")?`);
        if (propRegex.test(configBlock)) {
            configBlock = configBlock.replace(propRegex, `${property}: ${value}`);
        } else {
            configBlock += `\n  ${property}: ${value}`;
        }
        return code.replace(regex, `---\nconfig:\n${configBlock}\n---\n`);
    } else {
        return `---\nconfig:\n  ${property}: ${value}\n---\n` + code;
    }
}

export function updateMermaidFontFamily(code: string, fontString: string): string {
    const regex = /^---\nconfig:\n([\s\S]*?)\n---\n/m;
    const match = code.match(regex);
    if (match) {
        let configBlock = match[1];
        
        // Update top-level fontFamily
        const fontRegex = /(^|\n)  fontFamily:\s*[^\n]+/;
        if (fontRegex.test(configBlock)) {
            configBlock = configBlock.replace(fontRegex, `$1  fontFamily: '${fontString}'`);
        } else {
            configBlock += `\n  fontFamily: '${fontString}'`;
        }

        // Update themeVariables: fontFamily
        const themeVarsRegex = /(^|\n)  themeVariables:([\s\S]*?)(?=\n  [a-zA-Z0-9]+:|$)/;
        const themeVarsMatch = configBlock.match(themeVarsRegex);
        
        if (themeVarsMatch) {
            let varsBlock = themeVarsMatch[2];
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
