import { Module } from '@nestjs/common';
import { JobFetchService } from '../job-fetch/job-fetch.service.js';
import { SponsorRegisterService } from '../sponsors/sponsor-register.service.js';
import { SponsorLookupService } from '../sponsors/sponsor-lookup.service.js';
import { JobProcessors } from './processors.js';
import { FilesService } from '../files/files.service.js';
import { CvVersionsService } from '../cv/cv-versions.service.js';
import { PdfJobsService } from '../cv/pdf-jobs.service.js';
import { ProfileService } from '../cv/profile.service.js';

/** Everything the worker runs. Services here are plain providers so the worker needs no HTTP modules. */
@Module({ providers: [JobProcessors, JobFetchService, SponsorRegisterService, SponsorLookupService, FilesService, CvVersionsService, PdfJobsService, ProfileService], exports: [JobProcessors] })
export class JobsModule {}
