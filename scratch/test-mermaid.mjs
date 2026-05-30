import { JSDOM } from 'jsdom';
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="mermaid-container"></div></body></html>`);
global.window = dom.window;
global.document = dom.window.document;

import mermaid from 'mermaid';
mermaid.initialize({ startOnLoad: false });
const { svg } = await mermaid.render('test', 'sequenceDiagram\nparticipant Alice as A\nparticipant Bob as B\nAlice->>Bob: Hello Bob\nnote over Alice: note');
console.log(svg);
