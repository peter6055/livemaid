import mermaid from 'mermaid';
mermaid.initialize({ startOnLoad: false });
const { svg } = await mermaid.render('test', 'sequenceDiagram\nparticipant Alice\nparticipant Bob\nAlice->>Bob: Hello Bob, how are you?\nnote over Alice,Bob: Test Note\nalt If happy\nAlice->>Bob: great\nend');
console.log(svg);
