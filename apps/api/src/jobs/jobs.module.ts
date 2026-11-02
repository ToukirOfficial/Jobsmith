import { Module } from '@nestjs/common';
import { JobProcessors } from './processors.js';

@Module({ providers: [JobProcessors], exports: [JobProcessors] })
export class JobsModule {}
