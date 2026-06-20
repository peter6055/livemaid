import mermaid from "mermaid";

let initPromise: Promise<void> | null = null;

export function ensureMermaidInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = new Promise((resolve) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        flowchart: { htmlLabels: true },
      });
      resolve();
    });
  }
  return initPromise;
}
