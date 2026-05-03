/**
 * FileStorageRepositoryImpl — Wraps FileStorageProtocol with validation.
 *
 * @see Requirements 26.1, 26.2, 26.3, 26.4, 26.5
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { FileStorageProtocol } from '@core/protocols';
import type {
  FileStorageRepository,
  FileUploadInput,
} from '@core/domains/fileStorage/repositories/FileStorageRepository';
import type { FileUploadResult } from '@core/domains/fileStorage/entities';

export const FileStorageRepositoryImpl = ({
  fileStorageProtocol,
}: {
  fileStorageProtocol: FileStorageProtocol;
}): FileStorageRepository => ({
  async upload(
    tenantId: string,
    domain: string,
    file: FileUploadInput,
  ): Promise<DomainResult<FileUploadResult>> {
    try {
      const metadata = await fileStorageProtocol.upload({
        buffer: file.buffer,
        originalFilename: file.originalFilename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        tenantId,
        domain,
      });

      return ok({
        key: metadata.key,
        filename: metadata.filename,
        mimeType: metadata.mimeType,
        sizeBytes: metadata.sizeBytes,
      });
    } catch (error) {
      return fail(
        technicalError('FILE_UPLOAD_FAILED', 'Failed to upload file', {
          cause: error,
        }),
      );
    }
  },

  async getSignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<DomainResult<string>> {
    try {
      const url = await fileStorageProtocol.getSignedUrl(key, expiresInSeconds);
      return ok(url);
    } catch (error) {
      return fail(
        technicalError(
          'FILE_SIGNED_URL_FAILED',
          'Failed to generate signed URL',
          { cause: error },
        ),
      );
    }
  },

  async delete(key: string): Promise<DomainResult<void>> {
    try {
      await fileStorageProtocol.delete(key);
      return ok(undefined);
    } catch (error) {
      return fail(
        technicalError('FILE_DELETE_FAILED', 'Failed to delete file', {
          cause: error,
        }),
      );
    }
  },
});
