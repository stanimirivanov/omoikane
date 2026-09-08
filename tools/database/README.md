# Database verification tools

`generate-types.mjs` regenerates the public Supabase TypeScript contract with
normalized line endings.

`verify-manifest-concurrency.mjs` runs via
`pnpm db:test:manifest-concurrency` and is included in `pnpm db:verify`.
It requires the local Supabase Docker container. It copies the local database
into a uniquely named disposable database in that container, clears analysis
fixtures only in the copy, and starts two independent PostgreSQL connections
with competing model selections. Both must receive the same manifest.
Cleanup drops only the generated `omoikane_manifest_test_<uuid>` database,
including on failure; it never resets or writes to the source database.
The local administrative role is needed to restore Supabase-owned schema
settings. The test does not use hosted database credentials or a model provider.

For an interrupted process that cannot run cleanup, inspect local database
names and remove only its disposable test database. Ordinary pgTAP tests remain
transactional and cover validation, authorization, immutability, and lease
recovery. This additional test covers competing committed transactions.
