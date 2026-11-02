# 0002 A saved job and its application are one record

**Decision.** `Application` holds both the job (title, company, advert) and the application (stage, channel,
dates). A saved job is simply an application in the Saved stage.

**Why.** Every journey in the PRD moves a job forward through stages; two tables would mean joins and sync
problems for no gain. Stage history lives in `StageEvent`, and what was sent is frozen in `Snapshot`.
