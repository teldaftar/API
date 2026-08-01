import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { BusinessException, ErrorCode } from '../common';
import {
  STORAGE_SERVICE,
  StorageService,
  StoredFile,
} from './storage.service';

const MAX_DIMENSION = 1280;

@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /**
   * Resize down to a max 1280px edge (never upscale), normalise to webp, and
   * persist via the storage backend.
   */
  async processImage(file: Express.Multer.File): Promise<StoredFile> {
    if (!file || !file.buffer) {
      throw BusinessException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'No image file provided',
      );
    }

    let output: Buffer;
    try {
      output = await sharp(file.buffer)
        .rotate() // respect EXIF orientation
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw BusinessException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'File is not a valid image',
      );
    }

    return this.storage.save(output, 'webp');
  }
}
