-- Household gender selects the SSA period life-table baseline. Life expectancy
-- is now derived from age, gender, and health concerns instead of being typed.
-- Keep the legacy life_expectancy_age column for existing database compatibility;
-- the API no longer reads or writes it.

ALTER TABLE people
ADD COLUMN gender TEXT CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE'));

ALTER TABLE people
ADD COLUMN other_health_concern_adjustment_years REAL
CHECK (other_health_concern_adjustment_years BETWEEN 0 AND 130);

-- A prior OTHER concern receives the requested three-year default, which
-- remains editable on the profile.
UPDATE people
SET other_health_concern_adjustment_years = 3
WHERE EXISTS (
    SELECT 1 FROM person_health_concerns
    WHERE person_health_concerns.person_id = people.id
      AND person_health_concerns.concern = 'OTHER'
);
