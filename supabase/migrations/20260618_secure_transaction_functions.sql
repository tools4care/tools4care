REVOKE EXECUTE ON FUNCTION guardar_venta_transaccional(
  uuid, uuid, uuid, uuid, numeric, numeric, text, text, jsonb,
  numeric, numeric, numeric, numeric, text, jsonb, numeric, numeric, numeric, numeric
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION procesar_devolucion_transaccional(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION guardar_venta_transaccional(
  uuid, uuid, uuid, uuid, numeric, numeric, text, text, jsonb,
  numeric, numeric, numeric, numeric, text, jsonb, numeric, numeric, numeric, numeric
) TO authenticated;

GRANT EXECUTE ON FUNCTION procesar_devolucion_transaccional(
  uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb
) TO authenticated;
