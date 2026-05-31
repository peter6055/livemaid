import fs from 'fs/promises';
import path from 'path';

export interface DiagramDocument {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  code: string;
  type: 'flowchart' | 'sequence' | 'class';
  subPages: { id: string; name: string; code: string }[];
  comments: { id: string; content: string; timestamp: string }[];
  versionHistory: { id: string; code: string; timestamp: string }[];
}

function normalizeDiagramDocument(raw: DiagramDocument): DiagramDocument {
  return {
    ...raw,
    subPages: Array.isArray(raw.subPages) ? raw.subPages : [],
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    versionHistory: Array.isArray(raw.versionHistory) ? raw.versionHistory : [],
  };
}

const DATA_DIR = path.join(process.cwd(), 'data');

export async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export async function getDiagrams(): Promise<DiagramDocument[]> {
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const diagrams: DiagramDocument[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(DATA_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      try {
        const doc = normalizeDiagramDocument(JSON.parse(content) as DiagramDocument);
        if (!doc.deletedAt) {
          diagrams.push(doc);
        }
      } catch (e) {
        console.error(`Failed to parse diagram file: ${file}`, e);
      }
    }
  }

  // Sort by updatedAt descending
  return diagrams.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getDiagram(id: string): Promise<DiagramDocument | null> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${id}.json`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const doc = normalizeDiagramDocument(JSON.parse(content) as DiagramDocument);
    if (doc.deletedAt) {
        return null; // Don't return soft-deleted files
    }
    return doc;
  } catch (e) {
    return null;
  }
}

export async function saveDiagram(doc: DiagramDocument): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${doc.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(normalizeDiagramDocument(doc), null, 2), 'utf-8');
}

export async function deleteDiagram(id: string): Promise<boolean> {
    const doc = await getDiagram(id);
    if (!doc) return false;

    doc.deletedAt = new Date().toISOString();
    await saveDiagram(doc);
    return true;
}
