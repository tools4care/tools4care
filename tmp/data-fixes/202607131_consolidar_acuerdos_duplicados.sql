-- One-time backfill: consolidate clients who currently have 2+ simultaneous
-- 'activo'/'roto' payment agreements into a single plan (same logic now
-- built into crearAcuerdo() in src/lib/paymentAgreements.js going forward).
-- Verified before running: 60 clients, $14,017.28 total pending across them.
-- This does NOT change how much anyone owes — it only merges it into one
-- schedule per client. Old agreements are kept (estado='renegociado'), not
-- deleted, so payment history is preserved.

DO $$
DECLARE
  r RECORD;
  v_ids uuid[];
  v_deuda numeric;
  v_num_cuotas int;
  v_dias_plazo int;
  v_fecha_limite timestamptz;
  v_nuevo_id uuid;
  v_monto_por_cuota numeric;
  v_monto_cuota numeric;
  v_dias_offset int;
  v_fecha_venc timestamptz;
  i int;
BEGIN
  FOR r IN
    SELECT
      cliente_id,
      array_agg(id ORDER BY created_at DESC) AS ids,
      (array_agg(van_id ORDER BY created_at DESC))[1] AS van_id,
      ROUND(SUM(monto_pendiente), 2) AS deuda,
      COUNT(*) AS n
    FROM acuerdos_pago
    WHERE estado IN ('activo', 'roto')
    GROUP BY cliente_id
    HAVING COUNT(*) >= 2
  LOOP
    v_ids := r.ids;
    v_deuda := r.deuda;
    IF v_deuda <= 0 THEN CONTINUE; END IF;

    -- Misma regla de auto-seleccion de cuotas que generarPlanPago() en JS
    v_num_cuotas := CASE
      WHEN v_deuda <= 30 THEN 1
      WHEN v_deuda <= 80 THEN 2
      WHEN v_deuda <= 200 THEN 3
      WHEN v_deuda <= 400 THEN 4
      ELSE 5
    END;
    v_num_cuotas := LEAST(GREATEST(v_num_cuotas, 1), 8);
    v_dias_plazo := GREATEST(18, v_num_cuotas * 7);
    v_fecha_limite := now() + (v_dias_plazo || ' days')::interval;

    INSERT INTO acuerdos_pago (
      cliente_id, van_id, monto_total, num_cuotas, dias_plazo, fecha_limite, excepcion_nota
    ) VALUES (
      r.cliente_id, r.van_id, v_deuda, v_num_cuotas, v_dias_plazo, v_fecha_limite,
      'Consolidacion automatica de ' || r.n || ' acuerdos previos en uno solo (backfill 2026-07-13)'
    )
    RETURNING id INTO v_nuevo_id;

    v_monto_por_cuota := ROUND(v_deuda / v_num_cuotas, 2);
    FOR i IN 0..(v_num_cuotas - 1) LOOP
      v_dias_offset := ROUND(((i + 1)::numeric / v_num_cuotas) * v_dias_plazo);
      v_fecha_venc := now() + (v_dias_offset || ' days')::interval;
      v_monto_cuota := CASE
        WHEN i = v_num_cuotas - 1 THEN ROUND(v_deuda - v_monto_por_cuota * (v_num_cuotas - 1), 2)
        ELSE v_monto_por_cuota
      END;
      INSERT INTO cuotas_acuerdo (acuerdo_id, numero_cuota, monto, fecha_vencimiento)
      VALUES (v_nuevo_id, i + 1, v_monto_cuota, v_fecha_venc);
    END LOOP;

    UPDATE acuerdos_pago
      SET estado = 'renegociado', fue_renegociado = true
      WHERE id = ANY(v_ids);

    UPDATE cuotas_acuerdo
      SET estado = 'cancelado'
      WHERE acuerdo_id = ANY(v_ids) AND estado IN ('pendiente', 'vencida', 'parcial');

    RAISE NOTICE 'Cliente % consolidado: % acuerdos -> % (% cuotas de %)', r.cliente_id, r.n, v_nuevo_id, v_num_cuotas, v_deuda;
  END LOOP;
END $$;
