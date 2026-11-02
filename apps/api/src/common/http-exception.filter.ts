import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

/** Consistent JSON errors: { statusCode, message, code?, fields? }. Never leaks stack traces or data. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 413) {
        res.status(413).json({ statusCode: 413, message: 'That file is too large. Check the size limit and try a smaller file.' });
        return;
      }
      const body = exception.getResponse();
      if (typeof body === 'string') {
        res.status(status).json({ statusCode: status, message: body });
        return;
      }
      const b = body as Record<string, unknown>;
      const message = Array.isArray(b['message']) ? (b['message'] as string[]).join('. ') : b['message'];
      res.status(status).json({ ...b, statusCode: status, message });
      return;
    }
    const maybe = exception as { status?: number; code?: string };
    if (maybe?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ statusCode: 413, message: 'That file is too large. Check the size limit and try a smaller file.' });
      return;
    }
    if (typeof maybe?.status === 'number' && maybe.status >= 400 && maybe.status < 500) {
      res.status(maybe.status).json({ statusCode: maybe.status, message: 'The request could not be read.' });
      return;
    }
    // Only the error name and stack (code paths), never request bodies or personal data.
    this.logger.error(exception instanceof Error ? exception.stack : 'Unknown error');
    res.status(500).json({ statusCode: 500, message: 'Something went wrong. Please try again.' });
  }
}
