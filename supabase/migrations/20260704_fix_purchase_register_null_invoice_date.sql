-- Fix: purchase orders with NULL invoice_date were excluded by the date filter
-- (NULL >= p_start evaluates NULL/false). Fall back to created_at for both
-- filtering and ordering so undated POs still appear in the register.

CREATE OR REPLACE FUNCTION public.get_purchase_register(
  p_start date DEFAULT NULL, p_end date DEFAULT NULL,
  p_supplier text DEFAULT NULL, p_status text DEFAULT NULL,
  p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
RETURNS TABLE(po_id integer, invoice_number text, invoice_date date, supplier_name text,
  currency text, fx_rate_inr numeric, subtotal_foreign numeric, total_foreign numeric,
  total_inr numeric, payment_terms text, payment_method text, status text,
  line_count integer, total_qty integer, items_summary text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    po.id, po.invoice_number, po.invoice_date, po.supplier_name, po.currency,
    po.fx_rate_inr, po.subtotal_foreign, po.total_foreign, po.total_inr,
    po.payment_terms, po.payment_method, po.status,
    agg.line_count, agg.total_qty, agg.items_summary
  FROM purchase_orders po
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int, SUM(pol.quantity)::int,
      STRING_AGG(COALESCE(pol.description, pol.supplier_style_no, '?') || ' x' || pol.quantity::text, '; ' ORDER BY pol.id)
    FROM purchase_order_lines pol WHERE pol.purchase_order_id = po.id
  ) agg(line_count, total_qty, items_summary) ON true
  WHERE (p_start IS NULL OR COALESCE(po.invoice_date, po.created_at::date) >= p_start)
    AND (p_end   IS NULL OR COALESCE(po.invoice_date, po.created_at::date) <= p_end)
    AND (p_supplier IS NULL OR LOWER(po.supplier_name) ILIKE '%' || LOWER(p_supplier) || '%')
    AND (p_status   IS NULL OR po.status = p_status)
  ORDER BY COALESCE(po.invoice_date, po.created_at::date) DESC NULLS LAST, po.id DESC
  LIMIT p_limit OFFSET p_offset;
$function$;
