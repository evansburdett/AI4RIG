-- Installs from before 0.1.4 still carry the "Placeholder" models the app first
-- shipped with. RIG's own models arrived in 0012, so these only clutter the
-- model list. One an account was filled from stays, so nothing changes under a
-- saved case; the advisor can delete it on the Models screen.

DELETE FROM model_portfolios
WHERE name LIKE 'Placeholder %'
  AND id NOT IN (SELECT model_id FROM accounts WHERE model_id IS NOT NULL);
