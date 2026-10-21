import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { mkdir, readdir, stat, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { StorageService, StoredFile } from './storage.service';

@Injectable()
export class LocalStorageService
  extends StorageService
  implements OnModuleInit
{
  private readonly dir: string;

  constructor(config: ConfigService) {
    super();
    this.dir = join(process.cwd(), config.getOrThrow<string>('UPLOADS_DIR'));
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async save(buffer: Buffer, extension: string): Promise<StoredFile> {
    const key = `${Date.now().toString(36)}-${randomBytes(8).toString(
      'hex',
    )}.${extension}`;
    await writeFile(join(this.dir, key), buffer);
    return { key, url: `/uploads/${key}` };
  }

  async remove(key: string): Promise<void> {
    await unlink(join(this.dir, key)).catch(() => undefined);
  }

  async list(): Promise<{ key: string; modifiedAt: Date }[]> {
    const entries = await readdir(this.dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map(async (e) => {
          const info = await stat(join(this.dir, e.name)).catch(() => null);
          return info ? { key: e.name, modifiedAt: info.mtime } : null;
        }),
    );
    return files.filter((f) => f !== null);
  }
}
