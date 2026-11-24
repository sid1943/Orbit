-- Orbit schema v6 (data only): drop the Markdown bullet ("* ", "- ", "+ ", "• ") that Trello checklists
-- written as lists left at the start of names, e.g. "* Fort Ord". New imports strip it too (`stripBullet`
-- in packages/core/src/text.ts). Changed rows get a new updated_at so the app picks them up.
-- Bold ("**x**"), rules ("---") and a lone marker are left alone.

UPDATE items SET
  title = CASE WHEN (substr(ltrim(title, ' ' || char(9)), 1, 1) IN ('*', '-', '+', '•') AND substr(ltrim(title, ' ' || char(9)), 2, 1) IN (' ', char(9)) AND trim(substr(ltrim(title, ' ' || char(9)), 3), ' ' || char(9)) <> '') THEN ltrim(substr(ltrim(title, ' ' || char(9)), 3), ' ' || char(9)) ELSE title END,
  data = json_set(data,
    '$.title', CASE WHEN (substr(ltrim(title, ' ' || char(9)), 1, 1) IN ('*', '-', '+', '•') AND substr(ltrim(title, ' ' || char(9)), 2, 1) IN (' ', char(9)) AND trim(substr(ltrim(title, ' ' || char(9)), 3), ' ' || char(9)) <> '') THEN ltrim(substr(ltrim(title, ' ' || char(9)), 3), ' ' || char(9)) ELSE title END,
    '$.checklists', json((SELECT json_group_array(json_set(c.value, '$.rows', json((SELECT json_group_array(CASE WHEN (substr(ltrim(json_extract(r.value, '$.text'), ' ' || char(9)), 1, 1) IN ('*', '-', '+', '•') AND substr(ltrim(json_extract(r.value, '$.text'), ' ' || char(9)), 2, 1) IN (' ', char(9)) AND trim(substr(ltrim(json_extract(r.value, '$.text'), ' ' || char(9)), 3), ' ' || char(9)) <> '') THEN json_set(r.value, '$.text', ltrim(substr(ltrim(json_extract(r.value, '$.text'), ' ' || char(9)), 3), ' ' || char(9))) ELSE json(r.value) END ORDER BY r.key)
        FROM json_each(c.value, '$.rows') r))) ORDER BY c.key)
      FROM json_each(items.data, '$.checklists') c)),
    '$.updatedAt', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE (substr(ltrim(title, ' ' || char(9)), 1, 1) IN ('*', '-', '+', '•') AND substr(ltrim(title, ' ' || char(9)), 2, 1) IN (' ', char(9)) AND trim(substr(ltrim(title, ' ' || char(9)), 3), ' ' || char(9)) <> '')
  OR EXISTS (SELECT 1 FROM json_each(items.data, '$.checklists') c, json_each(c.value, '$.rows') r
    WHERE (substr(ltrim(json_extract(r.value, '$.text'), ' ' || char(9)), 1, 1) IN ('*', '-', '+', '•') AND substr(ltrim(json_extract(r.value, '$.text'), ' ' || char(9)), 2, 1) IN (' ', char(9)) AND trim(substr(ltrim(json_extract(r.value, '$.text'), ' ' || char(9)), 3), ' ' || char(9)) <> ''));

UPDATE entities SET
  name = ltrim(substr(ltrim(name, ' ' || char(9)), 3), ' ' || char(9)),
  data = json_set(data, '$.name', ltrim(substr(ltrim(name, ' ' || char(9)), 3), ' ' || char(9)), '$.updatedAt', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)),
  updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE (substr(ltrim(name, ' ' || char(9)), 1, 1) IN ('*', '-', '+', '•') AND substr(ltrim(name, ' ' || char(9)), 2, 1) IN (' ', char(9)) AND trim(substr(ltrim(name, ' ' || char(9)), 3), ' ' || char(9)) <> '');
