-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- POST-INTEGRATION DATA AUDIT RPCs
-- Read-only. No writes or mutations. Validates WooCommerce + Shiprocket sync.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


-- ── 1. Revenue Reconciliation ─────────────────────────────────────────────────
-- Compares: order_lines revenue vs orders.order_total, delivery recognition,
-- BR-201 non-commercial split, sync run coverage.
CREATE OR REPLACE FUNCTION get_audit_revenue_reconciliation()
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSON;
BEGIN
  WITH classified AS (
    SELECT
      o.id,
      o.order_total_inr,
      o.ordered_at,
      o.status,
      COALESCE(oc.classification, 'paid_sale'::order_class) AS cls
    FROM orders o
    LEFT JOIN order_classifications oc ON oc.order_id = o.id
  ),
  line_rev AS (
    SELECT order_id, COALESCE(SUM(line_total_inr), 0) AS rev
    FROM order_lines GROUP BY order_id
  ),
  first_delivery AS (
    SELECT DISTINCT ON (order_id) order_id, delivered_at
    FROM shipments
    WHERE status = 'DELIVERED' AND delivered_at IS NOT NULL
    ORDER BY order_id, delivered_at DESC
  ),
  stats AS (
    SELECT
      COUNT(*)                                AS total_orders,
      ROUND(SUM(lr.rev), 2)                  AS gross_rev_lines_inr,
      ROUND(SUM(c.order_total_inr), 2)       AS gross_rev_orders_inr,
      COUNT(*) FILTER (
        WHERE c.cls != ALL(ARRAY['influencer_promotion','brand_seeding','internal_use','replacement']::order_class[])
      )                                       AS commercial_orders,
      ROUND(SUM(lr.rev) FILTER (
        WHERE c.cls != ALL(ARRAY['influencer_promotion','brand_seeding','internal_use','replacement']::order_class[])
      ), 2)                                   AS commercial_rev_inr,
      COUNT(*) FILTER (
        WHERE c.cls = ANY(ARRAY['influencer_promotion','brand_seeding','internal_use','replacement']::order_class[])
      )                                       AS non_commercial_orders,
      ROUND(SUM(c.order_total_inr) FILTER (
        WHERE c.cls = ANY(ARRAY['influencer_promotion','brand_seeding','internal_use','replacement']::order_class[])
      ), 2)                                   AS promo_value_inr,
      COUNT(*) FILTER (WHERE fd.order_id IS NOT NULL)
                                              AS delivered_orders,
      ROUND(SUM(lr.rev) FILTER (
        WHERE fd.order_id IS NOT NULL
        AND c.cls != ALL(ARRAY['influencer_promotion','brand_seeding','internal_use','replacement']::order_class[])
      ), 2)                                   AS recognized_rev_inr,
      MIN(c.ordered_at)                       AS first_order_at,
      MAX(c.ordered_at)                       AS last_order_at
    FROM classified c
    LEFT JOIN line_rev lr ON lr.order_id = c.id
    LEFT JOIN first_delivery fd ON fd.order_id = c.id
  ),
  sync_info AS (
    SELECT
      COALESCE(SUM(records_fetched), 0)   AS total_fetched,
      COALESCE(SUM(records_inserted), 0)  AS total_inserted,
      COALESCE(SUM(records_updated), 0)   AS total_updated,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_runs,
      MAX(completed_at)                   AS last_sync_at
    FROM sync_runs WHERE integration_key = 'woocommerce'
  )
  SELECT json_build_object(
    'total_orders',           s.total_orders,
    'gross_rev_lines_inr',    s.gross_rev_lines_inr,
    'gross_rev_orders_inr',   s.gross_rev_orders_inr,
    'line_order_variance_inr', ROUND(s.gross_rev_orders_inr - s.gross_rev_lines_inr, 2),
    'commercial_orders',      s.commercial_orders,
    'commercial_rev_inr',     s.commercial_rev_inr,
    'non_commercial_orders',  s.non_commercial_orders,
    'promo_value_inr',        s.promo_value_inr,
    'unclassified_orders',    s.total_orders - s.commercial_orders - s.non_commercial_orders,
    'delivered_orders',       s.delivered_orders,
    'recognized_rev_inr',     s.recognized_rev_inr,
    'first_order_at',         s.first_order_at,
    'last_order_at',          s.last_order_at,
    'wc_fetched',             si.total_fetched,
    'wc_inserted',            si.total_inserted,
    'wc_updated',             si.total_updated,
    'wc_failed_runs',         si.failed_runs,
    'wc_last_sync_at',        si.last_sync_at
  ) INTO v_result FROM stats s, sync_info si;
  RETURN v_result;
END;
$$;


-- ── 2. Order Reconciliation ───────────────────────────────────────────────────
-- Status breakdown, shipment coverage, customer linkage.
CREATE OR REPLACE FUNCTION get_audit_order_reconciliation()
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSON;
BEGIN
  WITH by_status AS (
    SELECT
      status,
      COUNT(*)                      AS cnt,
      ROUND(SUM(order_total_inr),2) AS revenue_inr
    FROM orders GROUP BY status ORDER BY cnt DESC
  ),
  overview AS (
    SELECT
      COUNT(*)                                                              AS total_orders,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM shipments s WHERE s.order_id = orders.id))           AS has_shipment,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM shipments s WHERE s.order_id = orders.id)
        AND status NOT IN ('cancelled','refunded','failed'))               AS completed_no_shipment,
      COUNT(*) FILTER (WHERE customer_id IS NOT NULL)                      AS linked_customer,
      COUNT(*) FILTER (WHERE customer_id IS NULL)                          AS no_customer,
      COUNT(*) FILTER (WHERE payment_method IS NULL)                       AS no_payment_method,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM order_classifications oc WHERE oc.order_id = orders.id)) AS unclassified,
      COUNT(DISTINCT DATE_TRUNC('month', ordered_at))                      AS months_covered
    FROM orders
  )
  SELECT json_build_object(
    'by_status', (SELECT json_agg(row_to_json(by_status.*)) FROM by_status),
    'overview',  (SELECT row_to_json(overview.*) FROM overview)
  ) INTO v_result;
  RETURN v_result;
END;
$$;


-- ── 3. Shipment Reconciliation ────────────────────────────────────────────────
-- Shiprocket rows, delivery/RTO rates, returns, sync coverage.
CREATE OR REPLACE FUNCTION get_audit_shipment_reconciliation()
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSON;
BEGIN
  WITH ship_stats AS (
    SELECT
      COUNT(*)                                                              AS total_rows,
      COUNT(DISTINCT shiprocket_order_id)                                  AS unique_sr_orders,
      COUNT(DISTINCT order_id)                                             AS linked_wc_orders,
      COUNT(*) FILTER (WHERE order_id IS NULL)                            AS orphaned_rows,
      COUNT(*) FILTER (WHERE status = 'DELIVERED' AND delivered_at IS NOT NULL) AS delivered_ok,
      COUNT(*) FILTER (WHERE status = 'DELIVERED' AND delivered_at IS NULL)     AS delivered_no_date,
      COUNT(*) FILTER (WHERE status IN ('RTO', 'RETURNED'))               AS rto_returned,
      COUNT(*) FILTER (WHERE status NOT IN ('DELIVERED','RTO','RETURNED')) AS in_transit,
      COUNT(*) FILTER (WHERE LOWER(payment_method) = 'cod')               AS cod_rows,
      COUNT(*) FILTER (WHERE LOWER(payment_method) = 'prepaid')           AS prepaid_rows,
      ROUND(SUM(freight_total_inr), 2)                                    AS total_freight_inr,
      ROUND(SUM(cod_payable_inr), 2)                                      AS total_cod_payable_inr,
      MAX(delivered_at)                                                   AS last_delivery_at
    FROM shipments
  ),
  ret_stats AS (
    SELECT
      COUNT(*)                                                  AS total_returns,
      COUNT(*) FILTER (WHERE return_reason IS NOT NULL)         AS customer_returns,
      COUNT(*) FILTER (WHERE return_reason IS NULL)             AS rto_returns,
      COUNT(*) FILTER (WHERE qc_status = 'pass')               AS qc_pass,
      COUNT(*) FILTER (WHERE qc_status = 'fail')               AS qc_fail,
      COUNT(*) FILTER (WHERE qc_status = 'pending' OR qc_status IS NULL) AS qc_pending,
      ROUND(SUM(refund_amount_inr), 2)                         AS total_refunds_inr
    FROM returns
  ),
  sr_sync AS (
    SELECT
      COALESCE(SUM(records_fetched), 0)  AS total_fetched,
      COALESCE(SUM(records_inserted), 0) AS total_inserted,
      MAX(completed_at)                  AS last_sync_at,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_runs
    FROM sync_runs WHERE integration_key = 'shiprocket'
  )
  SELECT json_build_object(
    'shipments', (SELECT row_to_json(ship_stats.*) FROM ship_stats),
    'returns',   (SELECT row_to_json(ret_stats.*) FROM ret_stats),
    'sync',      (SELECT row_to_json(sr_sync.*) FROM sr_sync)
  ) INTO v_result;
  RETURN v_result;
END;
$$;


-- ── 4. COD Reconciliation ─────────────────────────────────────────────────────
-- COD payable (Shiprocket) vs COD remittances received (bank transactions).
CREATE OR REPLACE FUNCTION get_audit_cod_reconciliation()
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSON;
BEGIN
  WITH cod_shipped AS (
    SELECT
      COUNT(*)                              AS deliveries,
      ROUND(COALESCE(SUM(cod_payable_inr), 0), 2) AS cod_payable_inr,
      ROUND(COALESCE(SUM(cod_charges_inr), 0), 2) AS cod_charges_inr,
      ROUND(COALESCE(SUM(remitted_inr), 0), 2)    AS remitted_in_sr_inr,
      COUNT(*) FILTER (WHERE cod_remittance_date IS NOT NULL) AS remittance_dated
    FROM shipments
    WHERE LOWER(payment_method) = 'cod'
      AND status = 'DELIVERED'
      AND delivered_at IS NOT NULL
  ),
  bank_recv AS (
    SELECT
      ROUND(COALESCE(SUM(deposit_inr), 0), 2) AS bank_inr,
      COUNT(*)                                  AS bank_entries
    FROM bank_transactions
    WHERE transaction_type = 'cod_remittance'
  )
  SELECT json_build_object(
    'cod_deliveries',        cs.deliveries,
    'cod_payable_inr',       cs.cod_payable_inr,
    'cod_charges_inr',       cs.cod_charges_inr,
    'remitted_in_sr_inr',    cs.remitted_in_sr_inr,
    'remittance_dated_rows', cs.remittance_dated,
    'bank_cod_received_inr', br.bank_inr,
    'bank_entries',          br.bank_entries,
    'variance_inr',          ROUND(cs.cod_payable_inr - br.bank_inr, 2),
    'variance_pct',          ROUND(
      CASE WHEN cs.cod_payable_inr > 0
        THEN (cs.cod_payable_inr - br.bank_inr) / cs.cod_payable_inr * 100
        ELSE 0 END, 1)
  ) INTO v_result FROM cod_shipped cs, bank_recv br;
  RETURN v_result;
END;
$$;


-- ── 5. Influencer / Promotional Order Analysis ────────────────────────────────
-- Returns all non-commercial + zero-value + payment-less orders with shipments.
CREATE OR REPLACE FUNCTION get_audit_influencer_orders()
RETURNS TABLE (
  order_id          int,
  wc_order_id       int,
  ordered_at        timestamptz,
  order_total_inr   numeric,
  payment_method    text,
  classification    text,
  is_manual         boolean,
  has_shipment      boolean,
  shipment_status   text,
  delivered_at      timestamptz,
  suggested_category text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id,
    o.woocommerce_order_id,
    o.ordered_at,
    o.order_total_inr,
    o.payment_method,
    COALESCE(oc.classification::text, 'unclassified'),
    COALESCE(oc.is_manual, false),
    EXISTS (SELECT 1 FROM shipments s2 WHERE s2.order_id = o.id),
    (SELECT s.status      FROM shipments s WHERE s.order_id = o.id ORDER BY s.id DESC LIMIT 1),
    (SELECT s.delivered_at FROM shipments s WHERE s.order_id = o.id
     AND s.status = 'DELIVERED' ORDER BY s.id DESC LIMIT 1),
    CASE oc.classification::text
      WHEN 'influencer_promotion' THEN 'INFLUENCER'
      WHEN 'brand_seeding'        THEN 'PROMOTIONAL'
      WHEN 'internal_use'         THEN 'INTERNAL'
      WHEN 'replacement'          THEN 'REPLACEMENT'
      WHEN 'warranty'             THEN 'WARRANTY'
      WHEN 'cancelled'            THEN 'CANCELLED'
      ELSE CASE
        WHEN o.order_total_inr = 0 THEN 'SUSPECTED INFLUENCER'
        WHEN o.payment_method IS NULL
          AND EXISTS (SELECT 1 FROM shipments s3 WHERE s3.order_id = o.id)
          THEN 'SUSPECTED PROMOTIONAL'
        ELSE 'REVIEW'
      END
    END
  FROM orders o
  LEFT JOIN order_classifications oc ON oc.order_id = o.id
  WHERE
    oc.classification = ANY(ARRAY['influencer_promotion','brand_seeding','internal_use','replacement']::order_class[])
    OR o.order_total_inr = 0
    OR (o.payment_method IS NULL
        AND EXISTS (SELECT 1 FROM shipments s4 WHERE s4.order_id = o.id))
  ORDER BY o.ordered_at DESC;
$$;


-- ── 6. Set Product BOM Validation ─────────────────────────────────────────────
-- Validates Classic/Summer/Core Set BOMs and unit consumption.
CREATE OR REPLACE FUNCTION get_audit_set_products()
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSON;
BEGIN
  WITH set_info AS (
    SELECT
      p.id                          AS product_id,
      p.name                        AS set_name,
      ROUND(p.selling_price_inr, 2) AS set_price_inr,
      pb.id                         AS bom_id,
      COUNT(pbl.id)                 AS component_count,
      ROUND(SUM(pbl.standalone_price_inr), 2) AS total_ssp_inr,
      BOOL_OR(pbl.component_type = 'bra')     AS has_bra,
      BOOL_OR(pbl.component_type = 'leggings') AS has_leggings
    FROM products p
    JOIN product_boms pb ON pb.set_product_id = p.id
    LEFT JOIN product_bom_lines pbl ON pbl.bom_id = pb.id
    GROUP BY p.id, p.name, p.selling_price_inr, pb.id
  ),
  set_sales AS (
    SELECT
      pv.product_id,
      COUNT(DISTINCT ol.order_id)   AS orders_count,
      COALESCE(SUM(ol.quantity), 0) AS units_sold
    FROM order_lines ol
    JOIN product_variants pv ON pv.id = ol.variant_id
    GROUP BY pv.product_id
  ),
  set_explosions AS (
    SELECT
      set_product_id,
      COUNT(DISTINCT order_line_id) AS explosion_lines,
      COUNT(DISTINCT order_id)      AS exploded_orders
    FROM order_line_bom_explosions
    GROUP BY set_product_id
  )
  SELECT json_agg(
    json_build_object(
      'product_id',       si.product_id,
      'set_name',         si.set_name,
      'set_price_inr',    si.set_price_inr,
      'bom_id',           si.bom_id,
      'component_count',  si.component_count,
      'total_ssp_inr',    si.total_ssp_inr,
      'has_bra',          si.has_bra,
      'has_leggings',     si.has_leggings,
      'bom_valid',        (si.has_bra AND si.has_leggings AND si.component_count = 2),
      'ssp_vs_price_ok',  (ABS(si.total_ssp_inr - si.set_price_inr) < 10),
      'orders_count',     COALESCE(ss.orders_count, 0),
      'units_sold',       COALESCE(ss.units_sold, 0),
      'explosion_lines',  COALESCE(se.explosion_lines, 0),
      'exploded_orders',  COALESCE(se.exploded_orders, 0),
      'explosion_coverage_pct',
        ROUND(CASE WHEN COALESCE(ss.orders_count, 0) > 0
          THEN COALESCE(se.exploded_orders, 0)::numeric / ss.orders_count * 100
          ELSE 100 END, 1)
    ) ORDER BY si.set_name
  )
  INTO v_result
  FROM set_info si
  LEFT JOIN set_sales ss ON ss.product_id = si.product_id
  LEFT JOIN set_explosions se ON se.set_product_id = si.product_id;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;


-- ── 7. Revenue Recognition Health ────────────────────────────────────────────
-- Checks: delivered_at NULL on DELIVERED rows, line/order mismatch,
-- unmapped order lines, order classification coverage.
CREATE OR REPLACE FUNCTION get_audit_revenue_recognition_health()
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSON;
BEGIN
  WITH ship_health AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'DELIVERED')                             AS total_delivered,
      COUNT(*) FILTER (WHERE status = 'DELIVERED' AND delivered_at IS NOT NULL) AS delivered_with_date,
      COUNT(*) FILTER (WHERE status = 'DELIVERED' AND delivered_at IS NULL)     AS delivered_missing_date,
      COUNT(*) FILTER (WHERE status != 'DELIVERED' AND delivered_at IS NOT NULL) AS non_delivered_has_date
    FROM shipments
  ),
  mismatch AS (
    SELECT
      COUNT(DISTINCT o.id)                          AS orders_mismatched,
      ROUND(SUM(ABS(o.order_total_inr - COALESCE(lr.rev, 0))), 2) AS total_mismatch_inr
    FROM orders o
    LEFT JOIN (SELECT order_id, SUM(line_total_inr) AS rev
               FROM order_lines GROUP BY order_id) lr ON lr.order_id = o.id
    WHERE ABS(o.order_total_inr - COALESCE(lr.rev, 0)) > 1
      AND o.status NOT IN ('cancelled','refunded','failed')
  ),
  line_health AS (
    SELECT
      COUNT(*)                                               AS total_lines,
      COUNT(*) FILTER (WHERE variant_id IS NOT NULL)         AS mapped_lines,
      COUNT(*) FILTER (WHERE variant_id IS NULL)             AS unmapped_lines,
      COUNT(*) FILTER (WHERE line_total_inr IS NULL OR line_total_inr = 0) AS zero_rev_lines
    FROM order_lines
  ),
  cls_health AS (
    SELECT
      COUNT(*)                                               AS total_orders,
      COUNT(*) FILTER (WHERE oc.order_id IS NOT NULL)        AS classified,
      COUNT(*) FILTER (WHERE oc.order_id IS NULL)            AS unclassified,
      COUNT(*) FILTER (WHERE oc.is_manual = true)            AS manually_classified
    FROM orders o
    LEFT JOIN order_classifications oc ON oc.order_id = o.id
  )
  SELECT json_build_object(
    'shipment_health',       (SELECT row_to_json(ship_health.*) FROM ship_health),
    'revenue_mismatch',      (SELECT row_to_json(mismatch.*) FROM mismatch),
    'line_health',           (SELECT row_to_json(line_health.*) FROM line_health),
    'classification_health', (SELECT row_to_json(cls_health.*) FROM cls_health)
  ) INTO v_result;
  RETURN v_result;
END;
$$;


-- ── Grant execute permissions ─────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_audit_revenue_reconciliation()    TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_order_reconciliation()      TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_shipment_reconciliation()   TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_cod_reconciliation()        TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_influencer_orders()         TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_set_products()              TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_revenue_recognition_health() TO authenticated;
