# Student and trainer registration

Apply from the repository root:

```powershell
node placepro-backend/scripts/migrate-registration.js
```

Restart the backend services after applying the migration. It adds nullable `users.mobile_number`, `must_change_password` (default false), `auth_version` (default zero), and normalized unique indexes for user/student emails and student roll numbers. Existing passwords and password-change statuses are preserved. Existing normalized duplicates cause a safe migration failure; no records are merged or deleted.

Admin registration uses `POST /api/v1/students` and `POST /api/v1/users/trainers`. The existing `POST /users` delegates student/trainer registrations to the same implementation. Student fields: name, email, mobileNumber, rollNumber, academicBatchId, section, and optional cgpa. Trainer fields: name, email, mobileNumber, and assignedBatchIds. Trainers use the existing `academic_batches.trainer_ids` assignment array. Department comes from selected batches; no separate department or faculty-ID model was introduced.

The normalized 10-digit Indian mobile number is the initial password. Only its bcrypt hash is stored as a credential; the mobile number is stored separately as contact information. Creation responses never include the password or hash. Users must change this password via `POST /auth/change-password` with currentPassword and newPassword. New passwords require at least 12 characters, letters and numbers, and at most 72 UTF-8 bytes. Password rotation invalidates earlier JWTs. The shared auth middleware reads the database on every request and blocks all ordinary protected routes until password change completes, including direct API requests.

Existing unlinked students can receive accounts only when normalized name, email, roll number and existing batch agree. Their student ID, CGPA, scores, assessments and projects remain intact. Existing linked students are rejected. Registration, linking, trainer assignments and audit logging commit in one transaction.

Run tests from `placepro-backend`:

```powershell
node --test tests/registration.test.js tests/company-eligible-batches.test.js tests/shortlist-csv.test.js tests/github-statistics.test.js
```

Tests use temporary PostgreSQL schemas. The full schema's pre-existing malformed legacy domain-upgrade delimiters are outside this migration; tests use fresh-table definitions and apply this migration separately.

Login and password-change rate limiting is per auth-service process (15 attempts per IP/account in 15 minutes). Multiple auth replicas need a shared limiter before scaling. Credentials are not automatically sent by email or SMS. The admin should communicate the initial-login instructions through the institution's existing process.
