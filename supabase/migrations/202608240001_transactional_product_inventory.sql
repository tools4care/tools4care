-- Keep product creation/deletion and their inventory side effects atomic.
-- A failure anywhere in either function rolls the whole operation back.

CREATE OR REPLACE FUNCTION public.create_product_with_initial_stock(
  p_product jsonb,
  p_initial_quantity numeric DEFAULT 0,
  p_location text DEFAULT 'almacen',
  p_van_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_location text := lower(COALESCE(p_location, 'almacen'));
  v_quantity numeric := COALESCE(p_initial_quantity, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.store_cash_is_privileged() THEN
    RAISE EXCEPTION 'Supervisor or administrator required to create products';
  END IF;
  IF p_product IS NULL OR jsonb_typeof(p_product) <> 'object' THEN
    RAISE EXCEPTION 'Product data is required';
  END IF;
  IF NULLIF(btrim(p_product->>'codigo'), '') IS NULL THEN
    RAISE EXCEPTION 'Product code is required';
  END IF;
  IF NULLIF(btrim(p_product->>'nombre'), '') IS NULL THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;
  IF (p_product->>'precio') IS NULL THEN
    RAISE EXCEPTION 'Product price is required';
  END IF;
  IF v_quantity < 0 THEN
    RAISE EXCEPTION 'Initial quantity cannot be negative';
  END IF;
  IF v_location = 'warehouse' THEN v_location := 'almacen'; END IF;
  IF v_location NOT IN ('almacen', 'van') THEN
    RAISE EXCEPTION 'Invalid inventory location';
  END IF;
  IF v_location = 'van' THEN
    IF p_van_id IS NULL THEN RAISE EXCEPTION 'van_id is required for van stock'; END IF;
    IF NOT public.store_cash_can_access_location(p_van_id) THEN
      RAISE EXCEPTION 'Location access denied';
    END IF;
  END IF;

  INSERT INTO public.productos(
    codigo, nombre, marca, categoria, costo, precio, size, suplidor_id,
    notas, descuento_pct, bulk_min_qty, bulk_unit_price
  ) VALUES (
    btrim(p_product->>'codigo'),
    btrim(p_product->>'nombre'),
    NULLIF(p_product->>'marca', ''),
    NULLIF(p_product->>'categoria', ''),
    NULLIF(p_product->>'costo', '')::numeric,
    (p_product->>'precio')::numeric,
    NULLIF(p_product->>'size', ''),
    NULLIF(p_product->>'suplidor_id', '')::integer,
    COALESCE(p_product->>'notas', ''),
    NULLIF(p_product->>'descuento_pct', '')::numeric,
    NULLIF(p_product->>'bulk_min_qty', '')::integer,
    NULLIF(p_product->>'bulk_unit_price', '')::numeric
  )
  RETURNING id INTO v_product_id;

  IF v_quantity > 0 THEN
    PERFORM public.ajustar_stock(
      v_product_id,
      v_quantity,
      v_location,
      CASE WHEN v_location = 'van' THEN p_van_id ELSE NULL END,
      'Alta desde formulario de producto',
      auth.uid(),
      'producto_alta',
      v_product_id
    );
  END IF;

  RETURN v_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_unused_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_count bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.store_cash_is_privileged() THEN
    RAISE EXCEPTION 'Supervisor or administrator required to delete products';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.productos p
    WHERE p.id = p_product_id
      AND p.tenant_id IS NOT DISTINCT FROM public.current_user_tenant_id()
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Product not found or access denied';
  END IF;

  SELECT count(*) INTO v_sales_count
  FROM public.detalle_ventas
  WHERE producto_id = p_product_id;
  IF v_sales_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete: this product is used in % sale(s)', v_sales_count;
  END IF;

  DELETE FROM public.movimientos_stock WHERE producto_id = p_product_id;
  DELETE FROM public.stock_almacen WHERE producto_id = p_product_id;
  DELETE FROM public.stock_van WHERE producto_id = p_product_id;
  DELETE FROM public.productos
  WHERE id = p_product_id
    AND tenant_id IS NOT DISTINCT FROM public.current_user_tenant_id();
END;
$$;

REVOKE ALL ON FUNCTION public.create_product_with_initial_stock(jsonb,numeric,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_unused_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product_with_initial_stock(jsonb,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_unused_product(uuid) TO authenticated;
