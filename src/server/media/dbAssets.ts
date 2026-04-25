import { and, asc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { mediaAssets as mediaTable } from "@/server/db/schema";
import type {
  CreateMediaAssetInput,
  MediaAsset,
  MediaAssetRepository,
  MediaAssetStatus,
  MediaAssetType,
  UpdateMediaAssetInput,
} from "@/server/media/types";

type DbRow = typeof mediaTable.$inferSelect;

function db(): Db {
  return getDb();
}

function rowToAsset(row: DbRow): MediaAsset {
  return {
    id: row.id,
    runId: row.runId,
    messageId: row.messageId ?? undefined,
    type: row.type as MediaAssetType,
    storageKey: row.storageKey,
    url: row.url ?? undefined,
    contentType: row.contentType ?? undefined,
    sizeBytes: row.sizeBytes ?? undefined,
    durationMs: row.durationMs ?? undefined,
    status: row.status as MediaAssetStatus,
    failedReason: row.failedReason ?? undefined,
    sequenceIndex: row.sequenceIndex,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}

export const dbAssets: MediaAssetRepository = {
  async create(input: CreateMediaAssetInput): Promise<MediaAsset> {
    const [row] = await db()
      .insert(mediaTable)
      .values({
        id: input.id,
        runId: input.runId,
        messageId: input.messageId ?? null,
        type: input.type,
        storageKey: input.storageKey,
        url: input.url ?? null,
        contentType: input.contentType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        durationMs: input.durationMs ?? null,
        status: input.status,
        failedReason: input.failedReason ?? null,
        sequenceIndex: input.sequenceIndex,
      })
      .returning();
    return rowToAsset(row);
  },

  async update(id: string, patch: UpdateMediaAssetInput): Promise<MediaAsset> {
    const [row] = await db()
      .update(mediaTable)
      .set({
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.contentType !== undefined
          ? { contentType: patch.contentType }
          : {}),
        ...(patch.sizeBytes !== undefined
          ? { sizeBytes: patch.sizeBytes }
          : {}),
        ...(patch.durationMs !== undefined
          ? { durationMs: patch.durationMs }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.failedReason !== undefined
          ? { failedReason: patch.failedReason }
          : {}),
      })
      .where(eq(mediaTable.id, id))
      .returning();
    if (!row) throw new Error(`Media asset not found: ${id}`);
    return rowToAsset(row);
  },

  async findById(id: string): Promise<MediaAsset | null> {
    const [row] = await db()
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.id, id))
      .limit(1);
    return row ? rowToAsset(row) : null;
  },

  async listForRun(
    runId: string,
    type?: MediaAssetType,
  ): Promise<MediaAsset[]> {
    const where = type
      ? and(eq(mediaTable.runId, runId), eq(mediaTable.type, type))
      : eq(mediaTable.runId, runId);
    const rows = await db()
      .select()
      .from(mediaTable)
      .where(where)
      .orderBy(asc(mediaTable.messageId), asc(mediaTable.sequenceIndex));
    return rows.map(rowToAsset);
  },

  async listForMessage(messageId: string): Promise<MediaAsset[]> {
    const rows = await db()
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.messageId, messageId))
      .orderBy(asc(mediaTable.sequenceIndex));
    return rows.map(rowToAsset);
  },

  async deleteForRun(runId: string): Promise<number> {
    const rows = await db()
      .delete(mediaTable)
      .where(eq(mediaTable.runId, runId))
      .returning({ id: mediaTable.id });
    return rows.length;
  },
};
