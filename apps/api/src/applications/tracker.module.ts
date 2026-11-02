import { Module } from '@nestjs/common';
import { CompaniesService } from '../companies/companies.service.js';
import { ContactsService } from '../contacts/contacts.service.js';
import { InterviewsService } from '../interviews/interviews.service.js';
import { ReminderPlanner } from '../reminders/reminder-planner.js';
import { SponsorLookupService } from '../sponsors/sponsor-lookup.service.js';
import { ApplicationsService } from './applications.service.js';
import { ApplicationsController, CompaniesController, ContactsController, InterviewsController } from './tracker.controllers.js';

/** Applications, companies, contacts and interviews: the tracker. */
@Module({
  controllers: [ApplicationsController, CompaniesController, ContactsController, InterviewsController],
  providers: [ApplicationsService, CompaniesService, ContactsService, InterviewsService, ReminderPlanner, SponsorLookupService],
  exports: [ApplicationsService, CompaniesService, SponsorLookupService, ReminderPlanner],
})
export class TrackerModule {}
