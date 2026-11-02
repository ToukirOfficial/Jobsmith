# 0004 A local copy of the sponsor register

**Decision.** The worker downloads the Home Office "Register of licensed sponsors: workers" daily through the
GOV.UK Content API, only from GOV.UK's asset host, stream-parses it with column checks, and swaps the whole
`Sponsor` table in one transaction. The approach is ported from github.com/ToukirOfficial/uk-sponsors (MIT),
which is not published on npm.

**Why.** Badges on every card and table row need fast lookups, the register changes daily, and no user data
leaves the server to check a company. Matching uses a normalised company name; close names (pg_trgm) are
offered as "possible matches" for the user to confirm, never auto-accepted.
