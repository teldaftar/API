import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocalStorageService } from './local-storage.service';
import { STORAGE_SERVICE } from './storage.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    LocalStorageService,
    { provide: STORAGE_SERVICE, useExisting: LocalStorageService },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
