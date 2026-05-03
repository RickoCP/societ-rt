/**
 * FileUploadResult — Domain entity representing the result of a file upload.
 *
 * @see Requirements 26.2, 26.3, 26.5
 */

export interface FileUploadResult {
  readonly key: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}
