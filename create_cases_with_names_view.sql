-- Create a view that resolves customer/staff names for cases in one query.
CREATE OR REPLACE VIEW cases_with_names AS
SELECT
  c.case_id,
  c.case_no,
  c.subject,
  c.created_date,
  c.status,
  c.customer_id,
  c.staff_id,
  c.approve_staff,
  c.approve_manager,
  c.approve_director,
  c.approve_president,
  COALESCE(cu.name, c.customer_id::text, '') AS customer_name,
  COALESCE(s.name, '') AS staff_name
FROM cases AS c
-- customer_id stores the customer name, so join on a deduped name set
LEFT JOIN (
  SELECT name
  FROM customers
  GROUP BY name
) AS cu ON cu.name = c.customer_id
LEFT JOIN staffs AS s ON s.id::text = c.staff_id::text;
