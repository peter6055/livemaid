const fs = require('fs');

const cssPath = 'src/app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');

if (!css.includes('@import url("https://fonts.googleapis.com/css2')) {
  css = `@import url("https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400;1,700;1,900&family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Recursive:wght@300..1000&family=Source+Code+Pro:ital,wght@0,200..900;1,200..900&display=swap");\n\n` + css;
  fs.writeFileSync(cssPath, css);
  console.log('Fonts added to globals.css');
}
