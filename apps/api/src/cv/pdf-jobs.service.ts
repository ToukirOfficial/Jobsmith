import { Injectable, NotFoundException } from '@nestjs/common';
import { renderCvBuffer, renderLetterBuffer } from '@jobsmith/pdf';
import { DEFAULT_TZ, formatDate, type CvDocument, type CvTemplate, type LetterDocument } from '@jobsmith/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { QueueService } from '../jobs/queue.service.js';
import { FilesService } from '../files/files.service.js';
import { CvVersionsService } from './cv-versions.service.js';
import { ProfileService } from './profile.service.js';

export interface DataJobDto {
  id: string;
  status: 'PENDING' | 'DONE' | 'FAILED';
  fileId: string | null;
  error: string | null;
  result: unknown;
}

type PdfInput = { type: 'cv'; cvVersionId: string } | { type: 'letter'; draftId: string };
const slug = (s: string) => s.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document';

/** PDFs are rendered in the worker (project rule 8); the browser polls the job, then downloads the file. */
@Injectable()
export class PdfJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly files: FilesService,
    private readonly versions: CvVersionsService,
    private readonly profile: ProfileService,
  ) {}

  async requestCv(userId: string, cvVersionId: string): Promise<DataJobDto> {
    await this.versions.owned(userId, cvVersionId);
    return this.enqueue(userId, { type: 'cv', cvVersionId });
  }

  async requestLetter(userId: string, draftId: string): Promise<DataJobDto> {
    const d = await this.prisma.draft.findFirst({ where: { id: draftId, userId } });
    if (!d) throw new NotFoundException({ message: 'That draft could not be found.' });
    return this.enqueue(userId, { type: 'letter', draftId });
  }

  private async enqueue(userId: string, input: PdfInput) {
    const job = await this.prisma.dataJob.create({ data: { userId, kind: 'PDF', input: input as unknown as Prisma.InputJsonValue } });
    await this.queue.add('work', 'pdf', { id: job.id });
    return this.toDto(job);
  }

  async get(userId: string, id: string): Promise<DataJobDto> {
    const job = await this.prisma.dataJob.findFirst({ where: { id, userId } });
    if (!job) throw new NotFoundException({ message: 'That job could not be found.' });
    return this.toDto(job);
  }

  toDto(job: { id: string; status: 'PENDING' | 'DONE' | 'FAILED'; fileId: string | null; error: string | null; result: Prisma.JsonValue }): DataJobDto {
    return { id: job.id, status: job.status, fileId: job.fileId, error: job.error, result: job.result ?? null };
  }

  async letterDocument(userId: string, body: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<LetterDocument> {
    const [p, user] = await Promise.all([this.profile.get(userId, tx), tx.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true, name: true } })]);
    return { name: p.contact.fullName || user.name, contact: [p.contact.location, p.contact.email, p.contact.phone].filter((x): x is string => !!x), date: formatDate(new Date(), user.timeZone || DEFAULT_TZ), body };
  }

  /** Worker: render the PDF from the user's data as it is now. */
  async process(id: string) {
    const job = await this.prisma.dataJob.findUnique({ where: { id } });
    if (!job || job.status !== 'PENDING') return;
    const input = job.input as unknown as PdfInput;
    try {
      let buffer: Buffer;
      let name: string;
      let kind: 'CV_PDF' | 'LETTER_PDF';
      if (input.type === 'cv') {
        const { doc, version } = await this.versions.document(job.userId, input.cvVersionId);
        buffer = await renderCvBuffer(doc, version.template);
        name = `${slug(doc.name)}-CV-${slug(version.name)}.pdf`;
        kind = 'CV_PDF';
      } else {
        const draft = await this.prisma.draft.findFirstOrThrow({ where: { id: input.draftId, userId: job.userId }, include: { application: { include: { company: true } } } });
        const letter = await this.letterDocument(job.userId, draft.body);
        buffer = await renderLetterBuffer(letter);
        name = `${slug(letter.name)}-cover-letter-${slug(draft.application.company.name)}.pdf`;
        kind = 'LETTER_PDF';
      }
      const file = await this.files.save(job.userId, kind, name, 'application/pdf', buffer, this.prisma, new Date(Date.now() + 7 * 86_400_000));
      await this.prisma.dataJob.update({ where: { id }, data: { status: 'DONE', fileId: file.id } });
    } catch {
      await this.prisma.dataJob.update({ where: { id }, data: { status: 'FAILED', error: 'The PDF couldn’t be made. Please try again.' } });
    }
  }

  /** Worker: the PDF of a snapshot, rendered from the snapshot's frozen content (never from live data). */
  async processSnapshot(snapshotId: string) {
    const snap = await this.prisma.snapshot.findUnique({ where: { id: snapshotId }, include: { application: { include: { company: true } } } });
    if (!snap || snap.fileId) return;
    const content = snap.content as unknown as { doc?: CvDocument; template?: CvTemplate; letter?: LetterDocument };
    const company = slug(snap.application.company.name);
    const buffer = snap.kind === 'CV' ? await renderCvBuffer(content.doc!, content.template ?? 'CLASSIC') : await renderLetterBuffer(content.letter!);
    const name = snap.kind === 'CV' ? `${slug(content.doc!.name)}-CV-${company}.pdf` : `${slug(content.letter!.name)}-cover-letter-${company}.pdf`;
    const file = await this.files.save(snap.userId, snap.kind === 'CV' ? 'CV_PDF' : 'LETTER_PDF', name, 'application/pdf', buffer);
    // Attaching the PDF is the only write to a snapshot, and only once.
    const done = await this.prisma.snapshot.updateMany({ where: { id: snap.id, fileId: null }, data: { fileId: file.id } });
    if (!done.count) await this.files.remove(file.id);
  }
}
