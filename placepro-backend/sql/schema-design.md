# PlacePro Database Schema Design

This design documents the PostgreSQL schema in [`schema.updated.sql`](./schema.updated.sql).
The diagram focuses on persisted entities, primary keys, foreign keys, and their cardinalities.

## Entity relationship diagram

```mermaid
erDiagram
    USERS {
        BIGINT user_id PK
        VARCHAR email UK
        VARCHAR password_hash
        VARCHAR full_name
        user_role role
        account_status status
    }

    ACADEMIC_BATCHES {
        BIGINT academic_batch_id PK
        VARCHAR name UK
        VARCHAR department
        VARCHAR academic_years
        JSONB sections
        JSONB trainer_ids
        batch_status status
    }

    STUDENTS {
        BIGINT student_id PK
        BIGINT user_id FK,UK
        BIGINT academic_batch_id FK
        VARCHAR roll_no UK
        VARCHAR email UK
        DECIMAL cgpa
        DECIMAL average_score
        readiness_status readiness_status
    }

    EVALUATION_DOMAINS {
        BIGINT domain_id PK
        VARCHAR domain_code UK
        VARCHAR name UK
        TEXT description
        BOOLEAN is_active
    }

    SKILL_TAXONOMY {
        BIGINT skill_id PK
        VARCHAR skill_code UK
        VARCHAR skill_name UK
        BIGINT domain_id FK
        param_type parameter_type
        BOOLEAN is_active
    }

    IMPORT_BATCHES {
        BIGINT batch_id PK
        BIGINT uploaded_by FK
        BIGINT academic_batch_id FK
        event_type event_type
        VARCHAR event_title
        DATE event_date
        import_state import_status
        JSONB column_mapping_config
    }

    IMPORT_STUDENT_REVIEWS {
        BIGINT review_id PK
        BIGINT import_batch_id FK
        BIGINT requested_by FK
        BIGINT reviewed_by FK
        BIGINT student_id FK
        INT row_number
        VARCHAR roll_no
        VARCHAR status
        JSONB raw_row
        JSONB proposed_student_data
    }

    EVALUATION_RECORDS {
        BIGINT record_id PK
        BIGINT batch_id FK
        BIGINT student_id FK
        BIGINT trainer_id FK
        DECIMAL marks_obtained
        DECIMAL max_marks
        DECIMAL overall_score_pct
        BOOLEAN is_feedback_approved
        JSONB improvements
        JSONB raw_excel_row
    }

    SKILL_RATINGS {
        BIGINT rating_id PK
        BIGINT student_id FK
        BIGINT skill_id FK
        BIGINT source_id FK
        DECIMAL score_percentage
        event_type source_type
    }

    COMPANY_ROLES {
        BIGINT role_id PK
        VARCHAR company_name
        VARCHAR role_title
        DECIMAL package_lpa
        DECIMAL min_cgpa
        JSONB skill_weights
        JSONB skill_cutoffs
        JSONB criteria_json
    }

    AUDIT_LOGS {
        BIGINT log_id PK
        BIGINT actor_id FK
        VARCHAR actor_name
        VARCHAR module
        audit_status status
        JSONB metadata
    }

    USERS o|--o| STUDENTS : "user_id (unique)"
    ACADEMIC_BATCHES o|--o{ STUDENTS : "academic_batch_id"
    USERS o|--o{ IMPORT_BATCHES : "uploaded_by"
    ACADEMIC_BATCHES o|--o{ IMPORT_BATCHES : "academic_batch_id"
    IMPORT_BATCHES ||--o{ IMPORT_STUDENT_REVIEWS : "import_batch_id"
    USERS o|--o{ IMPORT_STUDENT_REVIEWS : "requested_by"
    USERS o|--o{ IMPORT_STUDENT_REVIEWS : "reviewed_by"
    STUDENTS o|--o{ IMPORT_STUDENT_REVIEWS : "student_id"
    IMPORT_BATCHES ||--o{ EVALUATION_RECORDS : "batch_id"
    STUDENTS ||--o{ EVALUATION_RECORDS : "student_id"
    USERS o|--o{ EVALUATION_RECORDS : "trainer_id"
    STUDENTS ||--o{ SKILL_RATINGS : "student_id"
    SKILL_TAXONOMY ||--o{ SKILL_RATINGS : "skill_id"
    EVALUATION_RECORDS ||--o{ SKILL_RATINGS : "source_id"
    USERS o|--o{ AUDIT_LOGS : "actor_id"
```

`||` denotes exactly one, `o|` zero or one, and `o{` zero or many. Optional foreign keys
are nullable; required foreign keys are not nullable.

## Relationship and lifecycle notes

- A student can optionally be linked to one user account and one academic batch. The unique
  constraint on `students.user_id` makes the account-to-student relationship one-to-one.
- An import batch belongs optionally to an uploader and an academic batch. It can contain
  student review rows and evaluation records.
- Evaluation records pair a student with an import batch. The unique constraint on
  `(batch_id, student_id)` permits at most one evaluation per student per import batch.
- Skill ratings belong to a student, a taxonomy skill, and an evaluation record. A rating's
  `source_type` is stored as an event type, but `source_id` is constrained to
  `evaluation_records.record_id`.
- Company roles store their skill requirements and criteria as JSONB. There is no
  foreign-key relationship from those JSON documents to `skill_taxonomy`.
- Delete behavior follows the SQL constraints: deleting users or academic batches preserves
  dependent rows by setting optional references to `NULL`; deleting import batches,
  students, skills, or evaluation records cascades to the dependent rows specified in the
  schema.

## JSONB attributes

The following columns are flexible documents or arrays, not separate relational entities:

- `academic_batches.sections`, `academic_batches.trainer_ids`
- `students.persona_badges`, `students.custom_profile_fields`
- `import_batches.headers`, `raw_preview_rows`, `validation_issues`,
  `column_mapping_config`
- `import_student_reviews.raw_row`, `proposed_student_data`
- `evaluation_records.improvements`, `raw_excel_row`, `custom_attributes`
- `company_roles.skill_weights`, `skill_cutoffs`, `criteria_json`
- `audit_logs.metadata`

JSONB contents are not validated by foreign keys. In particular, `trainer_ids` and
company-role skill identifiers do not enforce references to users or skills.
