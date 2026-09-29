-- US-27: a person can carry more than one health concern.
--
-- Blake, Sept 23 (14:07): "would there be a way to click multiple of those
-- items?" Health concerns move from one column on `people` to their own table,
-- one row per concern, so a person can hold any combination of them.
--
-- 'NONE' disappears as a value. With a set, no rows means nothing reported,
-- and keeping 'NONE' would allow a person marked both NONE and CANCER.
--
-- `health_concern_other` holds the free text behind an OTHER selection. The
-- Cycle 1 report asks for it so US-28 can pass it to the life-expectancy
-- estimate. It is the only free-text field on a person, which makes it the one
-- place an advisor could type something identifying: it holds a description of
-- a condition and nothing else. See docs/decisions/0006-no-pii-anywhere.md.
--
-- `people` is rebuilt rather than ALTERed because SQLite cannot drop a column
-- that a CHECK constraint mentions. The old concerns are parked in a plain
-- table first: with foreign keys on, DROP TABLE performs an implicit DELETE,
-- which would cascade through a person_health_concerns table created too early
-- and silently empty it.

-- ---------------------------------------------------------------------------
-- 1. Park the existing concerns somewhere without a foreign key
-- ---------------------------------------------------------------------------

CREATE TABLE _health_concern_carryover AS
SELECT id AS person_id, health_concern AS concern
FROM people
WHERE health_concern <> 'NONE';

-- ---------------------------------------------------------------------------
-- 2. Rebuild people without health_concern, with the free-text field
-- ---------------------------------------------------------------------------

CREATE TABLE people_new (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    client_case_id        INTEGER NOT NULL REFERENCES client_cases (id) ON DELETE CASCADE,
    role                  TEXT    NOT NULL CHECK (role IN ('CLIENT', 'SPOUSE')),
    -- Year only. Age is all the planning needs; a full date of birth is PII.
    birth_year            INTEGER,
    -- What OTHER means for this person. Empty unless OTHER is selected.
    -- A condition, never a name, a place, or anything else identifying.
    health_concern_other  TEXT    NOT NULL DEFAULT ''
        CHECK (length(health_concern_other) <= 200),
    life_expectancy_age   INTEGER,
    UNIQUE (client_case_id, role)
);

INSERT INTO people_new (id, client_case_id, role, birth_year, life_expectancy_age)
SELECT id, client_case_id, role, birth_year, life_expectancy_age
FROM people;

DROP TABLE people;

ALTER TABLE people_new RENAME TO people;

-- ---------------------------------------------------------------------------
-- 3. The concerns themselves
-- ---------------------------------------------------------------------------

-- No separate index on person_id: it is the leftmost column of the primary
-- key, so lookups by person already have one.
CREATE TABLE person_health_concerns (
    person_id  INTEGER NOT NULL REFERENCES people (id) ON DELETE CASCADE,
    concern    TEXT    NOT NULL CHECK (concern IN ('CANCER', 'STROKE', 'HEART', 'OTHER')),
    PRIMARY KEY (person_id, concern)
);

INSERT INTO person_health_concerns (person_id, concern)
SELECT person_id, concern FROM _health_concern_carryover;

DROP TABLE _health_concern_carryover;
