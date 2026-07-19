import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicEndpoint: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET', 'pharmasaas');
    const endpoint = config.get<string>('S3_ENDPOINT', 'http://localhost:9000');
    this.publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT', endpoint);
    this.client = new S3Client({
      region: config.get<string>('S3_REGION', 'us-east-1'),
      endpoint,
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', 'true') === 'true',
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: config.get<string>('S3_SECRET_KEY', 'minioadmin'),
      },
    });
  }

  /**
   * Uploads a tenant-scoped image and returns its public URL.
   */
  async uploadImage(
    tenantId: string,
    file: Express.Multer.File,
    folder: 'logos' | 'medicines' | 'avatars',
  ): Promise<{ url: string; key: string }> {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Only PNG, JPEG, WEBP and SVG images are allowed',
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Image must be smaller than 5 MB');
    }
    const extension = file.mimetype.split('/')[1].replace('+xml', '');
    const key = `tenants/${tenantId}/${folder}/${randomUUID()}.${extension}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return { url: `${this.publicEndpoint}/${this.bucket}/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
