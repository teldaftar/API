import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { BusinessException, ErrorCode } from '../common';
import { STORAGE_SERVICE, StorageService, StoredFile } from './storage.service';

const MAX_DIMENSION = 1280;
/** Unreferenced files younger than this may still belong to an unsaved form. */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class UploadsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(UploadsService.name);
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    this.sweepTimer = setInterval(() => {
      void this.sweepOrphans();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
    void this.sweepOrphans();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

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

  /**
   * Delete a stored image given its public URL (e.g. `/uploads/abc.webp`).
   * No-op for empty or non-local URLs. Never throws — a missing file is fine.
   */
  async removeByUrl(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const match = /^\/uploads\/(.+)$/.exec(url);
    if (!match) return; // external/unknown URL — leave it alone
    await this.storage.remove(match[1]);
  }

  /**
   * Delete stored files no phone/accessory points at — uploads abandoned in a
   * form that was cancelled, or replaced before saving. Files newer than the
   * grace period are kept since an open form may still submit them. Rows are
   * read across all shops and including soft-deleted ones, so a referenced
   * file is never removed.
   */
  async sweepOrphans(): Promise<number> {
    try {
      const files = await this.storage.list();
      const cutoff = Date.now() - ORPHAN_GRACE_MS;
      const stale = files.filter((f) => f.modifiedAt.getTime() < cutoff);
      if (stale.length === 0) return 0;

      const rows: { url: string }[] = await this.dataSource.query(
        `SELECT image_url AS url FROM phones WHERE image_url IS NOT NULL
         UNION
         SELECT image_url AS url FROM accessories WHERE image_url IS NOT NULL`,
      );
      const referenced = new Set(rows.map((r) => r.url));

      let removed = 0;
      for (const f of stale) {
        if (referenced.has(`/uploads/${f.key}`)) continue;
        await this.storage.remove(f.key);
        removed++;
      }
      if (removed > 0) {
        this.logger.log(`Removed ${removed} orphaned upload(s)`);
      }
      return removed;
    } catch (err) {
      this.logger.error(
        'Orphan upload sweep failed',
        err instanceof Error ? err.stack : String(err),
      );
      return 0;
    }
  }
}
