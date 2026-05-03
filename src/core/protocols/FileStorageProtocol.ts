/**
 * FileStorageProtocol — Core abstraction for file storage operations.
 *
 * Infrastructure layer provides the concrete implementation (e.g. S3, MinIO).
 *
 * @see Requirements 26.1, 26.2, 26.3, 26.4, 26.5
 */

export interface UploadParams {
  /** Raw file buffer */
  readonly buffer: Buffer;
  /** Original filename (used only for MIME detection, NOT for storage) */
  readonly originalFilename: string;
  /** MIME type of the file */
  readonly mimeType: string;
  /** File size in bytes */
  readonly sizeBytes: number;
  /** Tenant ID — used to namespace storage paths */
  readonly tenantId: string;
  /** Domain context (e.g. 'announcement', 'administration') */
  readonly domain: string;
}

export interface FileMetadata {
  /** Storage key (path) for the uploaded file */
  readonly key: string;
  /** UUID-based filename assigned by the system */
  readonly filename: string;
  /** MIME type */
  readonly mimeType: string;
  /** File size in bytes */
  readonly sizeBytes: number;
}

export interface FileStorageProtocol {
  upload(params: UploadParams): Promise<FileMetadata>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
