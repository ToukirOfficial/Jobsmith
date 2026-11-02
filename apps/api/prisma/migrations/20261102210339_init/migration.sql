-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('COMPANY_SITE', 'LINKEDIN', 'RECRUITER', 'REFERRAL', 'JOB_BOARD', 'EMAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('MANUAL', 'LINK', 'PASTE', 'BOOKMARKLET', 'IMPORT');

-- CreateEnum
CREATE TYPE "CodePurpose" AS ENUM ('LOGIN', 'RESET');

-- CreateEnum
CREATE TYPE "ProfileKind" AS ENUM ('EXPERIENCE', 'PROJECT', 'SKILLS', 'EDUCATION', 'CERTIFICATION', 'LINK');

-- CreateEnum
CREATE TYPE "CvTemplate" AS ENUM ('CLASSIC', 'MODERN', 'COMPACT');

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('CV', 'COVER_LETTER');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('CV_PDF', 'LETTER_PDF', 'EXPORT', 'IMPORT');

-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('COVER_LETTER', 'LINKEDIN_NOTE', 'FOLLOW_UP_EMAIL');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('RECRUITER', 'HIRING_MANAGER', 'REFERRAL', 'INTERVIEWER', 'OTHER');

-- CreateEnum
CREATE TYPE "LogDirection" AS ENUM ('SENT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "LogChannel" AS ENUM ('EMAIL', 'LINKEDIN', 'PHONE', 'IN_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('PHONE_SCREEN', 'TECHNICAL', 'TAKE_HOME', 'SYSTEM_DESIGN', 'BEHAVIOURAL', 'FINAL');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('FOLLOW_UP', 'INTERVIEW_TOMORROW', 'CLOSING_SOON', 'TAKE_HOME_DUE');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('GEMINI', 'OPENAI', 'ANTHROPIC', 'OPENAI_COMPATIBLE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "DataJobKind" AS ENUM ('EXPORT', 'IMPORT');

-- CreateTable
CREATE TABLE "InstallState" (
    "id" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "homeCity" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/London',
    "workAuthNotes" TEXT,
    "targetRoles" TEXT[],
    "targetLocations" TEXT[],
    "styleNote" TEXT,
    "weeklyTarget" INTEGER NOT NULL DEFAULT 5,
    "followUpDays" INTEGER NOT NULL DEFAULT 7,
    "emailReminders" BOOLEAN NOT NULL DEFAULT true,
    "icalToken" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "demoExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthCode" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "purpose" "CodePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "fullName" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "headline" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileItem" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "kind" "ProfileKind" NOT NULL,
    "data" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileBullet" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileBullet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CvVersion" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "template" "CvTemplate" NOT NULL DEFAULT 'CLASSIC',
    "selection" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CvVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "website" TEXT,
    "notes" TEXT,
    "sponsorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "town" TEXT,
    "county" TEXT,
    "rating" TEXT,
    "route" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorImport" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "url" TEXT,
    "location" TEXT,
    "workMode" "WorkMode",
    "salaryMinPence" INTEGER,
    "salaryMaxPence" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "closingDate" DATE,
    "description" TEXT,
    "notes" TEXT,
    "source" "JobSource" NOT NULL DEFAULT 'MANUAL',
    "stage" "Stage" NOT NULL DEFAULT 'SAVED',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER NOT NULL DEFAULT 0,
    "channel" "Channel",
    "appliedAt" TIMESTAMP(3),
    "firstReplyAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "cvVersionId" UUID,
    "cvSnapshotId" UUID,
    "letterSnapshotId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageEvent" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "from" "Stage",
    "to" "Stage" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "kind" "SnapshotKind" NOT NULL,
    "label" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "fileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "kind" "FileKind" NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterTemplate" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "kind" "DraftKind" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "companyId" UUID,
    "type" "ContactType" NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationContact" (
    "applicationId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationContact_pkey" PRIMARY KEY ("applicationId","contactId")
);

-- CreateTable
CREATE TABLE "ContactLog" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "applicationId" UUID,
    "direction" "LogDirection" NOT NULL,
    "channel" "LogChannel" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "type" "InterviewType" NOT NULL,
    "startsAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "durationMins" INTEGER,
    "interviewers" TEXT,
    "location" TEXT,
    "prepNotes" TEXT,
    "reflections" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "applicationId" UUID,
    "interviewId" UUID,
    "kind" "ReminderKind" NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFetch" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobFetch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'GEMINI',
    "model" TEXT,
    "baseUrl" TEXT,
    "keyCipher" TEXT,
    "keyLast4" TEXT,
    "monthlyLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "promptVersion" TEXT NOT NULL,
    "replay" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "savedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataJob" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "kind" "DataJobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "fileId" UUID,
    "input" JSONB,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoMail" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "userId" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_icalToken_key" ON "User"("icalToken");

-- CreateIndex
CREATE INDEX "User_isDemo_demoExpiresAt_idx" ON "User"("isDemo", "demoExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "AuthCode_userId_purpose_idx" ON "AuthCode"("userId", "purpose");

-- CreateIndex
CREATE INDEX "AuthCode_codeHash_idx" ON "AuthCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "ProfileItem_userId_kind_sortOrder_idx" ON "ProfileItem"("userId", "kind", "sortOrder");

-- CreateIndex
CREATE INDEX "ProfileBullet_userId_idx" ON "ProfileBullet"("userId");

-- CreateIndex
CREATE INDEX "ProfileBullet_itemId_sortOrder_idx" ON "ProfileBullet"("itemId", "sortOrder");

-- CreateIndex
CREATE INDEX "CvVersion_userId_idx" ON "CvVersion"("userId");

-- CreateIndex
CREATE INDEX "Company_userId_idx" ON "Company"("userId");

-- CreateIndex
CREATE INDEX "Company_normalizedName_idx" ON "Company"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Company_userId_normalizedName_key" ON "Company"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "Sponsor_normalizedName_idx" ON "Sponsor"("normalizedName");

-- CreateIndex
CREATE INDEX "SponsorImport_status_createdAt_idx" ON "SponsorImport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_cvSnapshotId_key" ON "Application"("cvSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_letterSnapshotId_key" ON "Application"("letterSnapshotId");

-- CreateIndex
CREATE INDEX "Application_userId_stage_position_idx" ON "Application"("userId", "stage", "position");

-- CreateIndex
CREATE INDEX "Application_userId_archivedAt_idx" ON "Application"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "Application_userId_normalizedTitle_idx" ON "Application"("userId", "normalizedTitle");

-- CreateIndex
CREATE INDEX "Application_companyId_idx" ON "Application"("companyId");

-- CreateIndex
CREATE INDEX "Application_cvVersionId_idx" ON "Application"("cvVersionId");

-- CreateIndex
CREATE INDEX "StageEvent_userId_at_idx" ON "StageEvent"("userId", "at");

-- CreateIndex
CREATE INDEX "StageEvent_applicationId_at_idx" ON "StageEvent"("applicationId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_fileId_key" ON "Snapshot"("fileId");

-- CreateIndex
CREATE INDEX "Snapshot_userId_idx" ON "Snapshot"("userId");

-- CreateIndex
CREATE INDEX "Snapshot_applicationId_idx" ON "Snapshot"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_path_key" ON "StoredFile"("path");

-- CreateIndex
CREATE INDEX "StoredFile_userId_idx" ON "StoredFile"("userId");

-- CreateIndex
CREATE INDEX "StoredFile_expiresAt_idx" ON "StoredFile"("expiresAt");

-- CreateIndex
CREATE INDEX "LetterTemplate_userId_idx" ON "LetterTemplate"("userId");

-- CreateIndex
CREATE INDEX "Draft_userId_idx" ON "Draft"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_applicationId_kind_key" ON "Draft"("applicationId", "kind");

-- CreateIndex
CREATE INDEX "Contact_userId_name_idx" ON "Contact"("userId", "name");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "ApplicationContact_contactId_idx" ON "ApplicationContact"("contactId");

-- CreateIndex
CREATE INDEX "ApplicationContact_userId_idx" ON "ApplicationContact"("userId");

-- CreateIndex
CREATE INDEX "ContactLog_userId_at_idx" ON "ContactLog"("userId", "at");

-- CreateIndex
CREATE INDEX "ContactLog_contactId_at_idx" ON "ContactLog"("contactId", "at");

-- CreateIndex
CREATE INDEX "ContactLog_applicationId_idx" ON "ContactLog"("applicationId");

-- CreateIndex
CREATE INDEX "Interview_userId_startsAt_idx" ON "Interview"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "Interview_userId_dueAt_idx" ON "Interview"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "Interview_applicationId_idx" ON "Interview"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_dedupeKey_key" ON "Reminder"("dedupeKey");

-- CreateIndex
CREATE INDEX "Reminder_userId_dueAt_idx" ON "Reminder"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "Reminder_dueAt_sentAt_idx" ON "Reminder"("dueAt", "sentAt");

-- CreateIndex
CREATE INDEX "Reminder_applicationId_idx" ON "Reminder"("applicationId");

-- CreateIndex
CREATE INDEX "Reminder_interviewId_idx" ON "Reminder"("interviewId");

-- CreateIndex
CREATE INDEX "JobFetch_userId_createdAt_idx" ON "JobFetch"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiSettings_userId_key" ON "AiSettings"("userId");

-- CreateIndex
CREATE INDEX "AiCall_userId_createdAt_idx" ON "AiCall"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_userId_createdAt_idx" ON "AgentRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_applicationId_createdAt_idx" ON "AgentRun"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentStep_userId_idx" ON "AgentStep"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentStep_runId_index_key" ON "AgentStep"("runId", "index");

-- CreateIndex
CREATE INDEX "DataJob_userId_createdAt_idx" ON "DataJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DataJob_fileId_idx" ON "DataJob"("fileId");

-- CreateIndex
CREATE INDEX "DemoMail_userId_createdAt_idx" ON "DemoMail"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthCode" ADD CONSTRAINT "AuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileItem" ADD CONSTRAINT "ProfileItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileBullet" ADD CONSTRAINT "ProfileBullet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileBullet" ADD CONSTRAINT "ProfileBullet_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProfileItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvVersion" ADD CONSTRAINT "CvVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_cvVersionId_fkey" FOREIGN KEY ("cvVersionId") REFERENCES "CvVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_cvSnapshotId_fkey" FOREIGN KEY ("cvSnapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_letterSnapshotId_fkey" FOREIGN KEY ("letterSnapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterTemplate" ADD CONSTRAINT "LetterTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationContact" ADD CONSTRAINT "ApplicationContact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationContact" ADD CONSTRAINT "ApplicationContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationContact" ADD CONSTRAINT "ApplicationContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLog" ADD CONSTRAINT "ContactLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLog" ADD CONSTRAINT "ContactLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLog" ADD CONSTRAINT "ContactLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFetch" ADD CONSTRAINT "JobFetch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataJob" ADD CONSTRAINT "DataJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataJob" ADD CONSTRAINT "DataJob_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoMail" ADD CONSTRAINT "DemoMail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
