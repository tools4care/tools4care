-- audit_log previously had "auth manage audit log" AND a separate
-- "authenticated app access" blanket policy (found on the live production
-- table, not in any tracked migration) — either one alone lets any
-- authenticated user (including a "vendedor") read, edit, or DELETE any audit
-- trail row, defeating the whole point of an audit log (non-repudiation).
-- Both must be dropped (permissive policies OR together). The AuditoriaLog.jsx
-- screen is already admin-only in the router (App.jsx); this makes the
-- database match that intent: any authenticated user can append their own
-- audit entries (logAudit() always inserts usuario_id = the acting user),
-- only an admin can read the log, and NOBODY can UPDATE or DELETE existing
-- entries through the app (no policy for those actions at all = default deny).
DROP POLICY IF EXISTS "auth manage audit log" ON audit_log;
DROP POLICY IF EXISTS "authenticated app access" ON audit_log;

CREATE POLICY "insert own audit entries" ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid() OR is_admin());

CREATE POLICY "admin reads audit log" ON audit_log
  FOR SELECT TO authenticated
  USING (is_admin());
