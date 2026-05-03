/**
 * FileStorageRepository — Core interface for file storage operations.
 *
 * Wraps FileStorageProtocol with domain-level validation.
 *
 * @see Requirements 26.1, 26.2, 26.3, 26.4, 26.5
 */

import type { DomainResult } from '@core/utils';
import type { FileUploadResult } from '../entities';

export interface FileUploadInput {
  readonly buffer: Buffer;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface FileStorageRepository {
  upload(
    tenantId: string,
    domain: string,
    file: FileUploadInput,
  ): Promise<DomainResult<FileUploadResult>>;

  getSignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<DomainResult<string>>;

  delete(key: string): Promise<DomainResult<void>>;
}
