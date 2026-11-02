import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '../generated/prisma/client.js';
import { config } from '../config.js';
import { randomToken } from '../common/crypto.js';
import { PrismaService } from '../prisma.service.js';

type Tx = Prisma.TransactionClient | PrismaService;
type Kind = 'CV_PDF' | 'LETTER_PDF' | 'EXPORT' | 'IMPORT';

/**
 * Stored files live under STORAGE_DIR/<userId>/<random name>, outside any public folder, and are only
 * served through GET /files/:id after an ownership check (project rule 9).
 */
@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  private root() {
    return path.resolve(config().STORAGE_DIR);
  }

  private full(rel: string) {
    const p = path.resolve(this.root(), rel);
    if (!p.startsWith(this.root() + path.sep)) throw new Error('Path outside storage');
    return p;
  }

  async save(userId: string, kind: Kind, name: string, mime: string, data: Buffer, tx: Tx = this.prisma, expiresAt: Date | null = null) {
    const ext = mime === 'application/pdf' ? 'pdf' : mime === 'application/zip' ? 'zip' : mime === 'text/csv' ? 'csv' : 'bin';
    const rel = `${userId}/${randomToken(18)}.${ext}`;
    await mkdir(path.dirname(this.full(rel)), { recursive: true, mode: 0o700 });
    await writeFile(this.full(rel), data, { mode: 0o600 });
    return tx.storedFile.create({ data: { userId, kind, path: rel, name, mime, size: data.length, expiresAt } });
  }

  /** The caller's own file, or 404. */
  async open(userId: string, id: string) {
    const f = await this.prisma.storedFile.findFirst({ where: { id, userId } });
    if (!f) throw new NotFoundException({ message: 'That file could not be found.' });
    try {
      await stat(this.full(f.path));
    } catch {
      throw new NotFoundException({ message: 'That file is no longer available.' });
    }
    return { file: f, stream: createReadStream(this.full(f.path)) };
  }

  async remove(id: string) {
    const f = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!f) return;
    await this.prisma.storedFile.delete({ where: { id } });
    await rm(this.full(f.path), { force: true });
  }
}
