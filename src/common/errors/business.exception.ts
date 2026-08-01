import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * A business-rule violation carrying a stable `code` the frontend keys off,
 * plus optional `details` (e.g. the conflicting phone id).
 */
export class BusinessException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details: Record<string, unknown> = {},
  ) {
    super({ code, message, details }, status);
  }

  static conflict(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ): BusinessException {
    return new BusinessException(code, message, HttpStatus.CONFLICT, details);
  }

  static badRequest(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ): BusinessException {
    return new BusinessException(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static notFound(
    message = 'Resource not found',
    details: Record<string, unknown> = {},
  ): BusinessException {
    return new BusinessException(
      ErrorCode.NOT_FOUND,
      message,
      HttpStatus.NOT_FOUND,
      details,
    );
  }

  static forbidden(
    message = 'Forbidden',
    details: Record<string, unknown> = {},
  ): BusinessException {
    return new BusinessException(
      ErrorCode.FORBIDDEN,
      message,
      HttpStatus.FORBIDDEN,
      details,
    );
  }
}
