/**
 * S3Adapter — Infrastructure implementation of FileStorageProtocol
 * using @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner.
 *
 * Factory function pattern for Awilix DI compatibility.
 * Reads S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY from environment.
 *
 * @see Requirements 26.1, 26.2, 26.3, 26.5
 */

import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  FileStorageProtocol,
  UploadParams,
  FileMetadata,
} from '@core/protocols';

function createS3Client(): S3Client {
  const region = process.env.S3_REGION ?? 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? '';

  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export const S3Adapter = (): FileStorageProtocol => {
  const client = createS3Client();
  const bucket = process.env.S3_BUCKET ?? '';

  return {
    upload: async (params: UploadParams): Promise<FileMetadata> => {
      const ext = extname(params.originalFilename);
      const filename = `${randomUUID()}${ext}`;
      const key = `${params.tenantId}/${params.domain}/${filename}`;

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: params.buffer,
          ContentType: params.mimeType,
          ContentLength: params.sizeBytes,
        }),
      );

      return {
        key,
        filename,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
      };
    },

    getSignedUrl: async (
      key: string,
      expiresInSeconds: number,
    ): Promise<string> => {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      return awsGetSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
      });
    },

    delete: async (key: string): Promise<void> => {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    },
  };
};
