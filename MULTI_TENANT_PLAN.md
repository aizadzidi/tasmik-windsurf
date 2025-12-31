# Multi-Tenant Plan (Eclazz)

## Keputusan Rasmi (Lock-in)
- 1 user = 1 tenant (sementara). Ini paling selamat dan mudah di-maintain.
- Login ikut domain/subdomain tenant. Landing pusat hanya untuk onboarding.

## Tujuan
Membolehkan banyak sekolah berkongsi aplikasi yang sama, tetapi data, tetapan,
dan pembayaran diasingkan sepenuhnya per sekolah (tenant).

## Prinsip Asas (Non-negotiable)
- Isolasi data per tenant (tiada kebocoran data antara sekolah).
- Defense-in-depth: RLS + constraints + audit + least privilege.
- Migration selamat: minimum downtime, boleh rollback.
- Consistency: semua data relation kekal dalam tenant yang sama.
- Operability: mudah debug dan jelas untuk support.
- Scale-ready: senang naik taraf bila tenant besar.

## Model Akses & Tenant Context
- Role sumber kebenaran: `user_profiles` (bukan `users.role` legacy).
- Tenant context ditentukan oleh domain dan membership user.
- Tenant status (active/suspended) disemak di RLS.
- Platform admin (global) dan school admin (tenant) dipisahkan.
- Legacy `users` hanya untuk compatibility dan akan dinyahgantung.

## Data Model & Constraints
- `tenants`: school record, status, metadata.
- `tenant_domains`: domain, is_primary, status, verified_at.
- `user_profiles`: user_id, tenant_id, role, status.
- Semua jadual core ada `tenant_id` + index.
- Unique constraints perlu tenant-scoped:
  - `classes` => unique (tenant_id, name)
  - `subjects` => unique (tenant_id, name)
  - lain-lain yang sekarang global perlu audit.
- Domain perlu normalized (lowercase) untuk elak clash.
- Konsistensi tenant untuk join tables:
  - enforce tenant_id match melalui composite FK atau trigger.
- Views/materialized views wajib tenant-scoped atau diganti RPC.

## Strategi Migrasi (Safe, Production)

### Fasa 0: Audit & Baseline
- Senarai semua table tanpa `tenant_id`.
- Senarai semua RPC SECURITY DEFINER yang tidak tenant-scoped.
- Semak semua policy RLS yang belum ada `tenant_guard`.
- Semak semua API yang guna service role tanpa auth check.
- Senarai policy `to public` yang perlu diketatkan.

### Fasa 1: Schema + Backfill (Done/Existing)
- `tenants`, `tenant_domains`, `user_profiles`.
- Tambah `tenant_id` ke semua jadual core + index.
- Backfill data sedia ada ke tenant default.
- Rujuk SQL scripts di root (lihat `SQL_SCRIPTS_REFERENCE.md`).

### Fasa 2: Enforce `tenant_id`
- `tenant_id` => NOT NULL untuk semua core tables.
- Default `tenant_id` guna helper `current_tenant_id()`.
- Tambah check untuk tenant status aktif.
- Backfill in batches, guna constraint NOT VALID dulu, kemudian validate.

### Fasa 3: Tenant Consistency
- Composite FK atau trigger untuk:
  - `exam_results` -> `students`, `exams` (tenant_id match).
  - `attendance_records` -> `students`, `classes`.
  - Semua join tables (exam_subjects, exam_classes, dll).
- Pastikan semua insert/update pakai tenant_id yang betul.
- FK tambah sebagai NOT VALID, validate selepas data bersih.

### Fasa 4: RLS Hardening
- `tenant_guard_*` restrictive untuk semua table dengan `tenant_id`.
- Tambah `FORCE ROW LEVEL SECURITY` untuk table tenant.
- Buang policy legacy yang guna `users.role` atau raw meta.
- `users` hanya boleh dibaca oleh tenant yang sama.
- Update semua views supaya tenant-safe atau convert ke RPC.
- `tenants` dan `tenant_domains` hanya diurus platform admin.

### Fasa 5: RPC Hardening
- Semua RPC SECURITY DEFINER mesti:
  - check tenant membership
  - filter by tenant_id
- Jika tak perlu definer, tukar ke SECURITY INVOKER.

### Fasa 6: App & API Changes
- Middleware: resolve host -> tenant_id.
- Semua server API wajib verify JWT dan tenant.
- Stop direct service-role queries tanpa auth/tenant.
- Konsisten guna `user_profiles` untuk role.
- Phase out akses `users.role` dalam code, guna `user_profiles`.
- Enforce canonical domain dan sediakan host mapping untuk staging/dev.

### Fasa 7: Onboarding & Domain
- Flow:
  1) tenant create
  2) create school_admin profile
  3) domain setup + verification
- Support custom domain dengan status verified.
- Auto-provision default configs per tenant.
- Demo UI onboarding di `/signup` (UI sahaja, backend akan disambung).

### Fasa 8: Payments
- Credentials encrypted per tenant.
- Webhook verify provider + tenant_id.
- Audit log payment events per tenant.
- Affiliate system: referrer earns 20% commission for the first year.

### Fasa 9: Observability & Scale
- Logging harus include tenant_id.
- Index komposit (tenant_id, created_at) untuk table besar.
- Future: partition atau dedicated DB untuk tenant besar.

## Tenant Lifecycle
- Suspend tenant: access blocked melalui RLS.
- Export data per tenant bila diminta.
- Delete selepas retention window + audit log.

## Polisi Keselamatan (Baseline)
- Service role hanya untuk sistem dalaman (onboarding, batch).
- Semua API route validate JWT + tenant membership.
- Helper functions guna `SECURITY DEFINER` dengan search_path.
- RLS recursion ditangani dengan fungsi definer yang kecil.
- Storage bucket rules wajib enforce tenant_id pada path/object.

## Rollout Plan
- Backup sebelum migration.
- Release berperingkat: internal -> pilot tenant -> public.
- Feature flag untuk multi-tenant routes.
- Clear rollback steps untuk setiap fasa.

## Testing & Verification
- Ujian RLS: cross-tenant SELECT/INSERT/UPDATE mesti fail.
- Ujian RPC: pastikan tenant scope ketat.
- Ujian onboarding: create tenant, domain, admin, configs.
- Ujian beban: query utama dengan index tenant_id.
- Ujian integriti: tenant_id null, mismatch, dan orphan rows = 0.

## Deliverables
- SQL migrations lengkap + audit notes.
- RLS policies stabil + SECURITY DEFINER cleanup.
- Middleware tenancy + API guardrails.
- Onboarding UI + admin settings.
- Dokumentasi operasi dan incident playbook.

## Checklist Siap
- [ ] Semua jadual ada `tenant_id` + index + NOT NULL.
- [ ] Semua unique constraints tenant-scoped.
- [ ] Semua RLS tenant_guard restrictive + FORCE RLS.
- [ ] Semua RPC tenant-scoped atau invoker.
- [ ] Semua API service role ada auth + tenant checks.
- [ ] Onboarding tenant + domain verified berjalan.
- [ ] Payment gateway per tenant berfungsi.
- [ ] Audit log per tenant tersedia.

## Future Upgrade (Optional)
- Multi-tenant membership (`tenant_memberships`) bila perlu.
- Dedicated DB/branch untuk enterprise besar.
- Data export per tenant untuk compliance.
