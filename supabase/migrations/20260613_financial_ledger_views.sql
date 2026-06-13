-- Canonical read-only financial ledger.
-- It unifies real money movement and non-cash account movement without
-- changing the operational tables that currently power the application.

CREATE OR REPLACE VIEW v_financial_ledger
WITH (security_invoker = true)
AS
WITH sale_payments AS (
  SELECT
    'sale:' || v.id::text || ':' || p.method AS entry_key,
    COALESCE(v.fecha, v.created_at) AS occurred_at,
    (COALESCE(v.fecha, v.created_at) AT TIME ZONE 'America/New_York')::date AS business_date,
    v.van_id,
    v.usuario_id,
    v.cliente_id,
    'ventas'::text AS source_table,
    v.id AS source_id,
    'sale_payment'::text AS event_type,
    p.method AS payment_method,
    ROUND(p.amount, 2) AS amount,
    'inflow'::text AS direction,
    true AS affects_cash,
    false AS affects_ar,
    COALESCE(v.numero_factura, 'Sale ' || LEFT(v.id::text, 8)) AS description,
    jsonb_build_object('sale_total', COALESCE(v.total_venta, v.total, 0), 'status', v.estado_pago) AS metadata
  FROM ventas v
  CROSS JOIN LATERAL (
    VALUES
      ('cash'::text, COALESCE(v.pago_efectivo, 0)::numeric),
      ('card'::text, COALESCE(v.pago_tarjeta, 0)::numeric),
      ('transfer'::text, COALESCE(v.pago_transferencia, 0)::numeric),
      ('other'::text, COALESCE(v.pago_otro, 0)::numeric)
  ) p(method, amount)
  WHERE COALESCE(v.tipo, 'venta') <> 'devolucion'
    AND p.amount <> 0
),
direct_ar_payments AS (
  SELECT
    'payment:' || p.id::text AS entry_key,
    p.fecha_pago AS occurred_at,
    (p.fecha_pago AT TIME ZONE 'America/New_York')::date AS business_date,
    p.van_id,
    p.usuario_id,
    p.cliente_id,
    'pagos'::text AS source_table,
    p.id AS source_id,
    'ar_payment'::text AS event_type,
    CASE
      WHEN LOWER(COALESCE(p.metodo_pago, '')) ~ '(cash|efectivo)' THEN 'cash'
      WHEN LOWER(COALESCE(p.metodo_pago, '')) ~ '(card|tarjeta|credit|debit)' THEN 'card'
      WHEN LOWER(COALESCE(p.metodo_pago, '')) ~ '(transfer|venmo|zelle|cash app|cashapp|apple pay|paypal|wire)' THEN 'transfer'
      WHEN LOWER(COALESCE(p.metodo_pago, '')) ~ '(check|cheque)' THEN 'check'
      ELSE 'other'
    END AS payment_method,
    ROUND(COALESCE(p.monto, 0), 2) AS amount,
    'inflow'::text AS direction,
    true AS affects_cash,
    true AS affects_ar,
    COALESCE(p.referencia, p.notas, 'Direct A/R payment') AS description,
    jsonb_build_object('original_method', p.metodo_pago, 'idem', p.idem) AS metadata
  FROM pagos p
  -- Payments created while saving a sale have idem_key and are already
  -- represented by ventas.pago_*; excluding them prevents duplication.
  WHERE p.idem_key IS NULL
    AND COALESCE(p.monto, 0) <> 0
),
money_refunds AS (
  SELECT
    'refund:' || v.id::text AS entry_key,
    COALESCE(v.created_at, v.fecha) AS occurred_at,
    (COALESCE(v.created_at, v.fecha) AT TIME ZONE 'America/New_York')::date AS business_date,
    v.van_id,
    v.usuario_id,
    v.cliente_id,
    'ventas'::text AS source_table,
    v.id AS source_id,
    'money_refund'::text AS event_type,
    CASE
      WHEN LOWER(COALESCE(v.metodo_pago, '')) ~ '(cash|efectivo)' THEN 'cash'
      WHEN LOWER(COALESCE(v.metodo_pago, '')) ~ '(card|tarjeta|credit|debit)' THEN 'card'
      WHEN LOWER(COALESCE(v.metodo_pago, '')) ~ '(transfer|venmo|zelle|cash app|cashapp|apple pay|paypal|wire)' THEN 'transfer'
      WHEN LOWER(COALESCE(v.metodo_pago, '')) ~ '(check|cheque)' THEN 'check'
      ELSE 'other'
    END AS payment_method,
    -ROUND(COALESCE(v.total_venta, v.total, 0), 2) AS amount,
    'outflow'::text AS direction,
    true AS affects_cash,
    false AS affects_ar,
    COALESCE(v.motivo_devolucion, 'Money refund') AS description,
    jsonb_build_object('origin_sale_id', v.venta_origen_id) AS metadata
  FROM ventas v
  WHERE v.tipo = 'devolucion'
    AND v.estado_pago = 'reembolsado'
    AND COALESCE(v.total_venta, v.total, 0) <> 0
),
expenses AS (
  SELECT
    'expense:' || g.id::text AS entry_key,
    COALESCE(g.created_at, g.fecha::timestamptz) AS occurred_at,
    g.fecha AS business_date,
    g.van_id,
    NULL::uuid AS usuario_id,
    NULL::uuid AS cliente_id,
    'gastos_conductor'::text AS source_table,
    g.id AS source_id,
    'expense'::text AS event_type,
    'cash'::text AS payment_method,
    -ROUND(COALESCE(g.monto, 0), 2) AS amount,
    'outflow'::text AS direction,
    true AS affects_cash,
    false AS affects_ar,
    CONCAT_WS(' — ', NULLIF(g.categoria, ''), NULLIF(g.descripcion, '')) AS description,
    jsonb_build_object('receipt_url', g.factura_url) AS metadata
  FROM gastos_conductor g
  WHERE COALESCE(g.monto, 0) <> 0
),
ar_movements AS (
  SELECT
    'ar:' || m.id::text AS entry_key,
    COALESCE(m.fecha, m.created_at) AS occurred_at,
    (COALESCE(m.fecha, m.created_at) AT TIME ZONE 'America/New_York')::date AS business_date,
    m.van_id,
    m.usuario_id,
    m.cliente_id,
    'cxc_movimientos'::text AS source_table,
    m.id AS source_id,
    CASE
      WHEN m.tipo IN ('devolucion', 'credito_tienda', 'pago') THEN 'ar_reduction'
      ELSE 'ar_increase'
    END AS event_type,
    NULL::text AS payment_method,
    CASE
      WHEN m.tipo IN ('devolucion', 'credito_tienda', 'pago') THEN -ROUND(COALESCE(m.monto, 0), 2)
      ELSE ROUND(COALESCE(m.monto, 0), 2)
    END AS amount,
    'non_cash'::text AS direction,
    false AS affects_cash,
    true AS affects_ar,
    COALESCE(m.nota, m.notas, m.referencia, 'A/R movement') AS description,
    jsonb_build_object('movement_type', m.tipo, 'sale_id', m.venta_id) AS metadata
  FROM cxc_movimientos m
  WHERE COALESCE(m.monto, 0) <> 0
),
store_credit_movements AS (
  SELECT
    'store_credit:' || c.id::text AS entry_key,
    c.created_at AS occurred_at,
    (c.created_at AT TIME ZONE 'America/New_York')::date AS business_date,
    c.van_id,
    c.usuario_id,
    c.cliente_id,
    'cliente_credito_movimientos'::text AS source_table,
    c.id AS source_id,
    'store_credit_' || c.tipo AS event_type,
    NULL::text AS payment_method,
    ROUND(COALESCE(c.monto, 0), 2) AS amount,
    'non_cash'::text AS direction,
    false AS affects_cash,
    false AS affects_ar,
    COALESCE(c.nota, 'Customer store credit') AS description,
    jsonb_build_object('resulting_balance', c.saldo_resultante, 'sale_id', c.venta_id) AS metadata
  FROM cliente_credito_movimientos c
  WHERE COALESCE(c.monto, 0) <> 0
)
SELECT * FROM sale_payments
UNION ALL SELECT * FROM direct_ar_payments
UNION ALL SELECT * FROM money_refunds
UNION ALL SELECT * FROM expenses
UNION ALL SELECT * FROM ar_movements
UNION ALL SELECT * FROM store_credit_movements;

CREATE OR REPLACE VIEW v_financial_ledger_daily
WITH (security_invoker = true)
AS
SELECT
  business_date,
  van_id,
  ROUND(SUM(amount) FILTER (WHERE affects_cash), 2) AS net_cash_movement,
  ROUND(SUM(amount) FILTER (WHERE affects_cash AND amount > 0), 2) AS money_in,
  ROUND(ABS(COALESCE(SUM(amount) FILTER (WHERE event_type = 'money_refund'), 0)), 2) AS refunds,
  ROUND(ABS(COALESCE(SUM(amount) FILTER (WHERE event_type = 'expense'), 0)), 2) AS expenses,
  ROUND(COALESCE(SUM(amount) FILTER (WHERE affects_cash AND payment_method = 'cash'), 0), 2) AS cash,
  ROUND(COALESCE(SUM(amount) FILTER (WHERE affects_cash AND payment_method = 'card'), 0), 2) AS card,
  ROUND(COALESCE(SUM(amount) FILTER (WHERE affects_cash AND payment_method = 'transfer'), 0), 2) AS transfer,
  ROUND(COALESCE(SUM(amount) FILTER (WHERE affects_cash AND payment_method = 'check'), 0), 2) AS checks,
  ROUND(COALESCE(SUM(amount) FILTER (WHERE affects_cash AND payment_method = 'other'), 0), 2) AS other,
  ROUND(COALESCE(SUM(amount) FILTER (WHERE affects_ar), 0), 2) AS net_ar_change,
  COUNT(*) FILTER (WHERE affects_cash) AS cash_entries,
  COUNT(*) FILTER (WHERE NOT affects_cash) AS non_cash_entries
FROM v_financial_ledger
GROUP BY business_date, van_id;

GRANT SELECT ON v_financial_ledger TO authenticated;
GRANT SELECT ON v_financial_ledger_daily TO authenticated;
