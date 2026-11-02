import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { idParam } from '@jobsmith/shared';
import type { UserContext } from '../common/auth-context.js';
import { CurrentUser } from '../common/decorators.js';
import { FilesService } from './files.service.js';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Owner only. Served as a download with a safe file name and no caching. */
  @Get(':id')
  async download(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Res() res: Response) {
    const { file, stream } = await this.files.open(u.userId, p.id);
    const safe = file.name.replace(/[^\w.\- ]+/g, '').slice(0, 120) || 'file';
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }
}
