export type StorageProviderName =
  | "local"
  | "vercel-blob"
  | "supabase"
  | "s3"
  | "r2";

export type StoragePutResult = {
  key: string;
  url: string;
  sizeBytes: number;
};

export interface StorageProvider {
  put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<StoragePutResult>;

  delete(key: string): Promise<void>;

  // Returns a URL clients can use to fetch the object. For providers that
  // issue signed URLs this may be short-lived; for public buckets it's the
  // persistent URL.
  getUrl(key: string): Promise<string>;
}
