/**
 * TypeScript SDK для работы с киоском самообслуживания
 * 
 * Предоставляет типизированные методы для работы с API терминала.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

// Type aliases для удобства
type Session = Database['public']['Tables']['sessions']['Row'];
type SessionInsert = Database['public']['Tables']['sessions']['Insert'];
type ThicknessMeasurement = Database['public']['Tables']['thickness_measurements']['Row'];
type DiagnosticsResult = Database['public']['Tables']['diagnostics_results']['Row'];
type Report = Database['public']['Tables']['reports']['Row'];
type Terminal = Database['public']['Tables']['terminals']['Row'];

export type ServiceType = 'thickness' | 'diagnostics';
export type SessionStatus = 'started' | 'measuring' | 'payment_pending' | 'payment_confirmed' | 'completed' | 'cancelled' | 'error';

/**
 * Генерация уникального 6-значного кода сессии
 */
function generateSessionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Класс для работы с сессиями киоска
 */
export class KioskSessionManager {
  /**
   * Создание новой сессии
   */
  static async createSession(params: {
    terminalId: string;
    serviceType: ServiceType;
    vehicleType?: string;
    vehicleBrand?: string;
    diagnosticsMode?: string;
    priceRub: number;
    clientContactType?: 'email' | 'phone';
    clientContactValue?: string; // Будет зашифрован
  }): Promise<{ session: Session | null; error: Error | null }> {
    try {
      const sessionCode = generateSessionCode();
      
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          terminal_id: params.terminalId,
          session_code: sessionCode,
          service_type: params.serviceType,
          vehicle_type: params.vehicleType,
          vehicle_brand: params.vehicleBrand,
          diagnostics_mode: params.diagnosticsMode,
          price_rub: params.priceRub,
          client_contact_type: params.clientContactType,
          status: 'started',
          payment_status: 'pending',
          metadata: {
            created_from: 'kiosk-sdk',
            demo_contact: params.clientContactValue, // Для dev-режима
          },
        })
        .select()
        .single();

      if (error) throw error;
      
      // Логируем событие
      await supabase.from('analytics_events').insert({
        terminal_id: params.terminalId,
        session_id: data.id,
        event_name: 'session_created',
        event_properties: {
          service_type: params.serviceType,
          session_code: sessionCode,
        },
      });

      return { session: data, error: null };
    } catch (error: any) {
      return { session: null, error };
    }
  }

  /**
   * Получение сессии по коду
   */
  static async getSessionByCode(sessionCode: string) {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        terminal:terminals(*),
        thickness_measurements(*),
        diagnostics_results(*),
        reports(*)
      `)
      .eq('session_code', sessionCode)
      .single();

    return { data, error };
  }

  /**
   * Обновление статуса сессии
   */
  static async updateSessionStatus(
    sessionId: string,
    status: SessionStatus
  ) {
    const { data, error } = await supabase
      .from('sessions')
      .update({
        status,
        ...(status === 'completed' && { completed_at: new Date().toISOString() }),
      })
      .eq('id', sessionId)
      .select()
      .single();

    return { data, error };
  }

  /**
   * Получение сводки сессии через Database Function
   */
  static async getSessionSummary(sessionCode: string) {
    const { data, error } = await supabase.rpc('get_session_summary', {
      p_session_code: sessionCode,
    });

    return { data, error };
  }
}

/**
 * Класс для работы с толщинометрией
 */
export class ThicknessService {
  /**
   * Сохранение замера толщины ЛКП
   */
  static async saveMeasurement(params: {
    sessionId: string;
    zoneName: string;
    zoneIndex: number;
    thicknessMicrons: number;
    status: 'normal' | 'warning' | 'critical';
  }) {
    const { data, error } = await supabase
      .from('thickness_measurements')
      .insert({
        session_id: params.sessionId,
        zone_name: params.zoneName,
        zone_index: params.zoneIndex,
        thickness_microns: params.thicknessMicrons,
        status: params.status,
      })
      .select()
      .single();

    return { data, error };
  }

  /**
   * Получение всех замеров для сессии
   */
  static async getMeasurements(sessionId: string) {
    const { data, error } = await supabase
      .from('thickness_measurements')
      .select('*')
      .eq('session_id', sessionId)
      .order('zone_index', { ascending: true });

    return { data, error };
  }

  /**
   * Анализ результатов толщинометрии
   */
  static analyzeMeasurements(measurements: ThicknessMeasurement[]) {
    const summary = {
      total: measurements.length,
      normal: measurements.filter(m => m.status === 'normal').length,
      warning: measurements.filter(m => m.status === 'warning').length,
      critical: measurements.filter(m => m.status === 'critical').length,
      average: measurements.length > 0
        ? Math.round(measurements.reduce((sum, m) => sum + (m.thickness_microns || 0), 0) / measurements.length)
        : 0,
    };

    return summary;
  }
}

/**
 * Класс для работы с OBD-II диагностикой
 */
export class DiagnosticsService {
  /**
   * Сохранение результатов диагностики
   */
  static async saveDiagnostics(params: {
    sessionId: string;
    dtcCodes: string[];
    dtcDescriptions: Record<string, string>;
    milStatus: boolean;
    freezeFrame?: any;
    readinessMonitors?: any;
    vehicleInfo?: any;
  }) {
    const { data, error } = await supabase
      .from('diagnostics_results')
      .insert({
        session_id: params.sessionId,
        dtc_codes: params.dtcCodes,
        dtc_descriptions: params.dtcDescriptions,
        mil_status: params.milStatus,
        freeze_frame: params.freezeFrame,
        readiness_monitors: params.readinessMonitors,
        vehicle_info: params.vehicleInfo,
      })
      .select()
      .single();

    return { data, error };
  }

  /**
   * Очистка DTC кодов
   */
  static async clearDTC(diagnosticsId: string) {
    const { data, error } = await supabase
      .from('diagnostics_results')
      .update({
        dtc_cleared: true,
        dtc_cleared_at: new Date().toISOString(),
      })
      .eq('id', diagnosticsId)
      .select()
      .single();

    return { data, error };
  }

  /**
   * Получение результатов диагностики для сессии
   */
  static async getDiagnostics(sessionId: string) {
    const { data, error } = await supabase
      .from('diagnostics_results')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    return { data, error };
  }
}

/**
 * Класс для работы с отчётами
 */
export class ReportService {
  /**
   * Генерация отчёта через Edge Function
   */
  static async generateReport(
    sessionId: string,
    format: 'pdf' | 'html' | 'json' = 'html'
  ) {
    const { data, error } = await supabase.functions.invoke('generate-report', {
      body: { session_id: sessionId, format },
    });

    return { data, error };
  }

  /**
   * Отправка отчёта клиенту
   */
  static async sendReport(
    reportId: string,
    deliveryChannel: 'email' | 'sms' | 'whatsapp'
  ) {
    const { data, error } = await supabase.functions.invoke('send-report', {
      body: { report_id: reportId, delivery_channel: deliveryChannel },
    });

    return { data, error };
  }

  /**
   * Получение отчётов для сессии
   */
  static async getReports(sessionId: string) {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    return { data, error };
  }
}

/**
 * Класс для работы с терминалами
 */
export class TerminalService {
  /**
   * Получение информации о терминале
   */
  static async getTerminal(terminalCode: string) {
    const { data, error } = await supabase
      .from('terminals')
      .select('*')
      .eq('terminal_code', terminalCode)
      .eq('status', 'active')
      .single();

    return { data, error };
  }

  /**
   * Получение статистики терминала
   */
  static async getTerminalStatistics(
    terminalId: string,
    dateFrom: string,
    dateTo: string
  ) {
    const { data, error } = await supabase.rpc('get_terminal_statistics', {
      p_terminal_id: terminalId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    });

    return { data, error };
  }

  /**
   * Логирование события устройства
   */
  static async logDeviceEvent(params: {
    terminalId: string;
    sessionId?: string;
    deviceType: 'thickness_gauge' | 'obd_adapter' | 'lock_mechanism' | 'payment_terminal';
    eventType: 'connected' | 'disconnected' | 'error' | 'measurement' | 'command_sent' | 'response_received';
    eventData: any;
    severity: 'info' | 'warning' | 'error' | 'critical';
  }) {
    const { data, error } = await supabase
      .from('device_logs')
      .insert({
        terminal_id: params.terminalId,
        session_id: params.sessionId,
        device_type: params.deviceType,
        event_type: params.eventType,
        event_data: params.eventData,
        severity: params.severity,
      })
      .select()
      .single();

    return { data, error };
  }
}

/**
 * Класс для Realtime подписок
 */
export class RealtimeService {
  /**
   * Подписка на обновления сессии
   */
  static subscribeToSession(
    sessionCode: string,
    callback: (payload: any) => void
  ) {
    const channel = supabase
      .channel(`session_${sessionCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `session_code=eq.${sessionCode}`,
        },
        callback
      )
      .subscribe();

    return channel;
  }

  /**
   * Подписка на новые замеры
   */
  static subscribeToMeasurements(
    sessionId: string,
    callback: (payload: any) => void
  ) {
    const channel = supabase
      .channel(`measurements_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'thickness_measurements',
          filter: `session_id=eq.${sessionId}`,
        },
        callback
      )
      .subscribe();

    return channel;
  }

  /**
   * Отписка от канала
   */
  static unsubscribe(channel: any) {
    return supabase.removeChannel(channel);
  }
}

// Экспорт всех сервисов
export const KioskSDK = {
  Session: KioskSessionManager,
  Thickness: ThicknessService,
  Diagnostics: DiagnosticsService,
  Report: ReportService,
  Terminal: TerminalService,
  Realtime: RealtimeService,
};
