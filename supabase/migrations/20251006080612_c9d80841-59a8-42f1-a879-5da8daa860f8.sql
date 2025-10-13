-- Fix Critical Security Issues: Restrict public access to sensitive tables
-- This migration addresses 3 security findings:
-- 1. sessions table: Customer contact information exposure
-- 2. payments table: Payment transaction data exposure  
-- 3. reports table: Service reports overly permissive access

-- =====================================================
-- 1. FIX SESSIONS TABLE RLS POLICIES
-- =====================================================
-- Drop overly permissive public policies
DROP POLICY IF EXISTS "Public can read sessions" ON public.sessions;
DROP POLICY IF EXISTS "Public can read active sessions" ON public.sessions;

-- Keep authenticated users policy
-- DROP and recreate to ensure it's correct
DROP POLICY IF EXISTS "Authenticated can manage sessions" ON public.sessions;

CREATE POLICY "Authenticated can manage sessions"
ON public.sessions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Add session-code based access for kiosk terminals (read-only, specific session)
-- This allows terminals to access their session via session_code without exposing all data
CREATE POLICY "Public can read own session via session_code"
ON public.sessions
FOR SELECT
TO anon
USING (
  session_code IS NOT NULL AND
  session_code = current_setting('request.headers', true)::json->>'x-session-code'
);

-- =====================================================
-- 2. FIX PAYMENTS TABLE RLS POLICIES
-- =====================================================
-- Drop the dangerous public access policy
DROP POLICY IF EXISTS "Публичный доступ к payments" ON public.payments;

-- Allow authenticated users to manage payments
CREATE POLICY "Authenticated can manage payments"
ON public.payments
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow public to read only their own payment via session_code
CREATE POLICY "Public can read own payment via session"
ON public.payments
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = payments.session_id
    AND s.session_code IS NOT NULL
    AND s.session_code = current_setting('request.headers', true)::json->>'x-session-code'
  )
);

-- =====================================================
-- 3. FIX REPORTS TABLE RLS POLICIES
-- =====================================================
-- Drop overly permissive public read policy
DROP POLICY IF EXISTS "Public can read reports" ON public.reports;

-- Keep authenticated policy (recreate to ensure correctness)
DROP POLICY IF EXISTS "Authenticated can manage reports" ON public.reports;

CREATE POLICY "Authenticated can manage reports"
ON public.reports
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Keep the delivered reports policy but make it more restrictive
DROP POLICY IF EXISTS "Public can read delivered reports" ON public.reports;

CREATE POLICY "Public can read own delivered reports via session"
ON public.reports
FOR SELECT
TO anon
USING (
  delivery_status = 'sent' AND
  EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = reports.session_id
    AND s.status = 'completed'
    AND s.session_code IS NOT NULL
    AND s.session_code = current_setting('request.headers', true)::json->>'x-session-code'
  )
);

-- =====================================================
-- SECURITY VERIFICATION COMMENTS
-- =====================================================
-- After this migration:
-- ✅ sessions: No public read access except via session_code header
-- ✅ payments: No public read access except via session_code header  
-- ✅ reports: Only delivered reports accessible via session_code header
-- ✅ All tables: Authenticated users have full access for admin/kiosk operations
-- 
-- For kiosk terminals to access data, they must:
-- 1. Include header: x-session-code: <their-session-code>
-- 2. Only access their own session/payment/report data
--
-- This prevents:
-- ❌ Mass data scraping of all sessions
-- ❌ Payment transaction monitoring
-- ❌ Unauthorized report access