import {
  CallHandler,
  Controller,
  ExecutionContext,
  HttpStatus,
  NestInterceptor,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Observable, catchError, throwError } from 'rxjs';
import { BusinessException, ErrorCode } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadResponseDto } from './dto/upload-response.dto';
import { UploadsService } from './uploads.service';

const MAX_SIZE_MB = 3;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Multer's size limit surfaces as a bare 413 PayloadTooLargeException; turn it
 * into a stable `IMAGE_TOO_LARGE` code (with the limit) the frontend can show.
 * Must wrap FileInterceptor, so it is listed before it.
 */
class ImageSizeErrorInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((err: unknown) =>
          throwError(() =>
            err instanceof PayloadTooLargeException
              ? new BusinessException(
                  ErrorCode.IMAGE_TOO_LARGE,
                  `Image must be smaller than ${MAX_SIZE_MB} MB`,
                  HttpStatus.PAYLOAD_TOO_LARGE,
                  { maxSizeMb: MAX_SIZE_MB, maxSizeBytes: MAX_SIZE_BYTES },
                )
              : err,
          ),
        ),
      );
  }
}

@ApiTags('uploads')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('image')
  @ApiOperation({
    summary: `Upload & resize an image (jpeg|png|webp, max ${MAX_SIZE_MB}MB)`,
    description: `Larger files → 413 \`IMAGE_TOO_LARGE\` with \`details.maxSizeMb\`.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: UploadResponseDto })
  @UseInterceptors(
    ImageSizeErrorInterceptor,
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          cb(
            BusinessException.badRequest(
              ErrorCode.VALIDATION_FAILED,
              'Only jpeg, png or webp images are allowed',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResponseDto> {
    return this.uploadsService.processImage(file);
  }
}
