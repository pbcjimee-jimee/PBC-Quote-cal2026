-- The invoker save RPC calls this helper, which enforces active-admin identity itself.
REVOKE ALL ON FUNCTION app_auth.latest_jobber_total_line_id(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION app_auth.latest_jobber_total_line_id(TEXT)
  TO authenticated;
