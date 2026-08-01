import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ErrorCode } from '../errors/error-codes';
import { BusinessException } from '../errors/business.exception';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Produces the single consistent error shape the whole API speaks:
 *   { statusCode, code, message, details }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.buildBody(exception);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown): ErrorBody {
    if (exception instanceof BusinessException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      return this.fromHttpException(status, res);
    }

    if (exception instanceof QueryFailedError) {
      // Unique-violation etc. fall through here if a service didn't guard it.
      this.logger.error(
        `QueryFailedError: ${exception.message}`,
        exception.stack,
      );
      return {
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Database constraint violation',
        details:
          process.env.NODE_ENV === 'production'
            ? {}
            : { db: exception.message },
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      details: {},
    };
  }

  private fromHttpException(
    status: number,
    res: string | object,
  ): ErrorBody {
    if (typeof res === 'string') {
      return {
        statusCode: status,
        code: this.defaultCodeFor(status),
        message: res,
        details: {},
      };
    }

    const obj = res as Record<string, unknown>;
    // class-validator throws { message: string[], error, statusCode }
    const rawMessage = obj.message;
    const message = Array.isArray(rawMessage)
      ? (rawMessage as string[]).join('; ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : this.defaultMessageFor(status);

    const code =
      typeof obj.code === 'string' ? obj.code : this.defaultCodeFor(status);

    const details =
      obj.details && typeof obj.details === 'object'
        ? (obj.details as Record<string, unknown>)
        : Array.isArray(rawMessage)
          ? { errors: rawMessage }
          : {};

    return { statusCode: status, code, message, details };
  }

  private defaultCodeFor(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  private defaultMessageFor(status: number): string {
    return HttpStatus[status] ?? 'Error';
  }
}
