import { ObjectId } from "mongodb";
import { getDiagrams, getFolders, saveDiagram, saveFolder } from "@/lib/api/storage";
import { getMigrationMarkersCollection } from "@/lib/db/collections";

const LEGACY_ADOPTION_KEY = "legacy-adoption";

function toWorkspaceIdString(workspaceId: string | ObjectId): string {
  return typeof workspaceId === "string" ? workspaceId : workspaceId.toString();
}

export async function adoptLegacyDiagrams(
  workspaceId: string | ObjectId,
): Promise<{ adoptedDiagrams: number; adoptedFolders: number }> {
  const workspaceIdString = toWorkspaceIdString(workspaceId);
  const diagrams = await getDiagrams();
  const folders = await getFolders();

  let adoptedDiagrams = 0;
  for (const diagram of diagrams) {
    if (!diagram.workspaceId) {
      await saveDiagram({ ...diagram, workspaceId: workspaceIdString });
      adoptedDiagrams++;
    }
  }

  let adoptedFolders = 0;
  for (const folder of folders) {
    if (!folder.workspaceId) {
      await saveFolder({ ...folder, workspaceId: workspaceIdString });
      adoptedFolders++;
    }
  }

  return { adoptedDiagrams, adoptedFolders };
}

export async function markLegacyAdoptionComplete(workspaceId: string | ObjectId): Promise<void> {
  const markers = await getMigrationMarkersCollection();
  await markers.insertOne({
    _id: new ObjectId(),
    key: LEGACY_ADOPTION_KEY,
    workspaceId: new ObjectId(toWorkspaceIdString(workspaceId)),
    completedAt: new Date(),
  });
}

export async function isLegacyAdoptionComplete(workspaceId: string | ObjectId): Promise<boolean> {
  const markers = await getMigrationMarkersCollection();
  const marker = await markers.findOne({
    key: LEGACY_ADOPTION_KEY,
    workspaceId: new ObjectId(toWorkspaceIdString(workspaceId)),
  });
  return !!marker;
}

export async function runLegacyAdoptionIfNeeded(workspaceId: string | ObjectId): Promise<void> {
  if (await isLegacyAdoptionComplete(workspaceId)) {
    return;
  }

  await adoptLegacyDiagrams(workspaceId);
  await markLegacyAdoptionComplete(workspaceId);
}
