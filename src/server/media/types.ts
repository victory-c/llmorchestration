export type MediaAssetType =
  | "audio-clip"
  | "video-scene"
  | "video-final"
  | "thumbnail";

export type MediaAssetStatus = "pending" | "processing" | "ready" | "failed";

export type MediaAsset = {
  id: string;
  runId: string;
  messageId?: string;
  type: MediaAssetType;
  storageKey: string;
  url?: string;
  contentType?: string;
  sizeBytes?: number;
  durationMs?: number;
  status: MediaAssetStatus;
  failedReason?: string;
  sequenceIndex: number;
  createdAt: string;
};

export type CreateMediaAssetInput = Omit<MediaAsset, "createdAt">;

export type UpdateMediaAssetInput = Partial<
  Pick<
    MediaAsset,
    | "url"
    | "contentType"
    | "sizeBytes"
    | "durationMs"
    | "status"
    | "failedReason"
  >
>;

export interface MediaAssetRepository {
  create(input: CreateMediaAssetInput): Promise<MediaAsset>;
  update(id: string, patch: UpdateMediaAssetInput): Promise<MediaAsset>;
  findById(id: string): Promise<MediaAsset | null>;
  listForRun(runId: string, type?: MediaAssetType): Promise<MediaAsset[]>;
  listForMessage(messageId: string): Promise<MediaAsset[]>;
  deleteForRun(runId: string): Promise<number>;
}
