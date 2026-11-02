import { Module } from '@nestjs/common';
import { JobFetchService } from '../job-fetch/job-fetch.service.js';
import { SponsorRegisterService } from '../sponsors/sponsor-register.service.js';
import { SponsorLookupService } from '../sponsors/sponsor-lookup.service.js';
import { JobProcessors } from './processors.js';

/** Everything the worker runs. Services here are plain providers so the worker needs no HTTP modules. */
@Module({ providers: [JobProcessors, JobFetchService, SponsorRegisterService, SponsorLookupService], exports: [JobProcessors] })
export class JobsModule {}
