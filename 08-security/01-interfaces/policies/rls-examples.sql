-- RLS (Row Level Security) Policy Examples
-- Примеры политик безопасности на уровне строк для защиты данных в БД

-- ===============================================
-- 1. Публичный VIEW для анонимного чтения
-- ===============================================
-- Создаём VIEW без персональных данных для фронтенда
CREATE OR REPLACE VIEW public.diagnostics_public AS
SELECT
  id,
  session_id,
  vehicle_make,
  vehicle_model,
  status,
  dtc_count,
  created_at,
  updated_at
FROM diagnostics
WHERE status IN ('completed', 'in_progress');

-- Разрешаем анонимное чтение только из VIEW
GRANT SELECT ON public.diagnostics_public TO anon;

-- ===============================================
-- 2. RLS для таблицы diagnostics
-- ===============================================
ALTER TABLE diagnostics ENABLE ROW LEVEL SECURITY;

-- Анонимные пользователи: только чтение через VIEW
CREATE POLICY "anon_read_only_via_view"
ON diagnostics
FOR SELECT
TO anon
USING (false); -- Прямой доступ запрещён

-- Service role: полный доступ (используется агентом и cloud-api)
CREATE POLICY "service_full_access"
ON diagnostics
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===============================================
-- 3. RLS для таблицы sessions
-- ===============================================
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Анонимные: нет доступа к персональным данным
CREATE POLICY "anon_no_access"
ON sessions
FOR ALL
TO anon
USING (false);

-- Service role: полный доступ
CREATE POLICY "service_full_access_sessions"
ON sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===============================================
-- 4. RLS для таблицы payments
-- ===============================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Анонимные: нет доступа к платёжным данным
CREATE POLICY "anon_no_access_payments"
ON payments
FOR ALL
TO anon
USING (false);

-- Service role: полный доступ
CREATE POLICY "service_full_access_payments"
ON payments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===============================================
-- 5. RLS для логов и аудита
-- ===============================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Анонимные: нет доступа
CREATE POLICY "anon_no_access_audit"
ON audit_logs
FOR ALL
TO anon
USING (false);

-- Service role: только запись (append-only)
CREATE POLICY "service_append_only_audit"
ON audit_logs
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "service_read_audit"
ON audit_logs
FOR SELECT
TO service_role
USING (true);

-- ===============================================
-- 6. Политики для пользователей с ролями
-- ===============================================
-- Пример: администраторы могут читать все данные
CREATE POLICY "admin_read_all"
ON diagnostics
FOR SELECT
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin'
);

-- Операторы киоска: только свои сессии
CREATE POLICY "operator_own_sessions"
ON sessions
FOR SELECT
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'operator' AND
  operator_id = auth.uid()
);

-- ===============================================
-- Контрольный список применения RLS
-- ===============================================
-- [ ] Все таблицы с персональными данными имеют RLS
-- [ ] Anon key не имеет доступа к записям в критичных таблицах
-- [ ] Service role используется только на серверах (не в браузере)
-- [ ] VIEW для публичного доступа не содержит PII
-- [ ] Аудит-логи защищены append-only политикой
-- [ ] Тестирование: попытка записи с anon key возвращает ошибку
