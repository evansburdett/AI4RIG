-- US-28: life expectancy is an estimate from age, gender, and health
-- concerns, made by an AI model and accepted or overridden by the advisor
-- (RIG, Sept 23). life_expectancy_age holds whichever value the advisor kept;
-- life_expectancy_source says which way it got there, so the profile can show
-- an AI figure as a suggestion rather than as the advisor's own.
--
-- 0005 replaced that with a Social Security table lookup minus three years per
-- concern, plus an advisor-typed adjustment for "Other". RIG did not ask for
-- either rule, so the adjustment column goes. Its values were never read by
-- anything but that lookup.

ALTER TABLE people DROP COLUMN other_health_concern_adjustment_years;

ALTER TABLE people ADD COLUMN life_expectancy_source TEXT
    CHECK (life_expectancy_source IN ('AI', 'ADVISOR'));

-- Every figure saved before now was typed by an advisor.
UPDATE people SET life_expectancy_source = 'ADVISOR' WHERE life_expectancy_age IS NOT NULL;
