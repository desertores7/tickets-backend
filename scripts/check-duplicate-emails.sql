-- Diagnostico previo a UserEmailUnique1785920000000.
-- CORRER ESTO ANTES de la migracion: si hay duplicados, la migracion falla.

-- 1) Duplicados exactos
SELECT email, COUNT(*) AS cuantos
FROM user
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY cuantos DESC;

-- 2) Duplicados ignorando mayusculas y espacios (los que la collation *_ci
--    tambien va a considerar iguales cuando el indice sea UNIQUE)
SELECT LOWER(TRIM(email)) AS email_normalizado, COUNT(*) AS cuantos
FROM user
GROUP BY LOWER(TRIM(email))
HAVING COUNT(*) > 1
ORDER BY cuantos DESC;

-- 3) Detalle de las filas involucradas, para decidir cual se conserva.
--    Criterio sugerido: conservar la que tiene isDeleted IS NULL; si hay mas de
--    una viva, conservar la que tiene actividad (ordenes, tickets).
SELECT u.uuid, u.email, u.firstName, u.lastName, u.active, u.isDeleted, u.createdAt,
       (SELECT COUNT(*) FROM orders o WHERE o.userUuid = u.uuid) AS ordenes,
       (SELECT COUNT(*) FROM ticket t WHERE t.userUuid = u.uuid) AS tickets
FROM user u
WHERE LOWER(TRIM(u.email)) IN (
  SELECT LOWER(TRIM(email)) FROM (SELECT email FROM user) x
  GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1
)
ORDER BY LOWER(TRIM(u.email)), u.createdAt;

-- 4) Emails con espacios o mayusculas que conviene normalizar igual
SELECT COUNT(*) AS a_normalizar FROM user WHERE email <> LOWER(TRIM(email));
