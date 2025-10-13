-- Создать таблицу webhook_events
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider text,
  intent_id text,
  status text,
  payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_intent_id ON public.webhook_events (intent_id);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- RPC для обновления статуса платежа (совместим с intent_id или id)
DROP FUNCTION IF EXISTS public.rpc_update_payment_status(TEXT, TEXT, JSONB) CASCADE;
CREATE OR REPLACE FUNCTION public.rpc_update_payment_status(
  p_intent_id TEXT,
  p_status TEXT,
  p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_intent_id_column BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'intent_id'
  ) INTO has_intent_id_column;

  IF has_intent_id_column THEN
    EXECUTE $$
      UPDATE public.payments
      SET status = $2,
          updated_at = now(),
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('webhook_payload', $3, 'webhook_updated_at', now())
      WHERE intent_id = $1
    $$ USING p_intent_id, p_status, p_payload;
  ELSE
    UPDATE public.payments
    SET status = p_status,
        updated_at = now(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('webhook_payload', p_payload, 'webhook_updated_at', now())
    WHERE id = p_intent_id;
  END IF;

  INSERT INTO public.webhook_events(provider, intent_id, status, payload)
  VALUES ('rpc_update_payment_status', p_intent_id, p_status, p_payload);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_payment_status(TEXT, TEXT, JSONB) TO authenticated;
