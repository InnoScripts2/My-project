import { z } from 'zod';

export const PaymentSchema = z.object({
  intentId: z.string(),
  status: z.enum(['created', 'pending', 'succeeded', 'failed']),
  amount: z.number(),
  currency: z.string(),
});

export const DeviceMetaSchema = z.object({
  obd: z
    .object({
      connected: z.boolean(),
      rssi: z.number().optional(),
      protocol: z.string().optional(),
    })
    .optional(),
  thickness: z
    .object({
      issued: z.boolean(),
      lastReturnTs: z.string().optional(),
    })
    .optional(),
});

export const SessionSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  service: z.enum(['OBD', 'THICKNESS']),
  status: z.enum(['created', 'running', 'completed', 'failed', 'cancelled']),
  payment: PaymentSchema.optional(),
  deviceMeta: DeviceMetaSchema.optional(),
});

export const LogEventSchema = z.object({
  ts: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  sessionId: z.string().optional(),
  tags: z.record(z.string()).optional(),
});

export const MetricPointSchema = z.object({
  ts: z.string(),
  name: z.string(),
  value: z.number(),
});

export const SessionListResponseSchema = z.object({
  sessions: z.array(SessionSchema),
  total: z.number(),
  page: z.number(),
  size: z.number(),
});

export const SessionLogsResponseSchema = z.object({
  logs: z.array(LogEventSchema),
  cursor: z.string().optional(),
  hasMore: z.boolean(),
});

export const MetricsResponseSchema = z.object({
  metrics: z.array(MetricPointSchema),
});

export const LoginRequestSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
});

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
});

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});

export const CommandResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export type Payment = z.infer<typeof PaymentSchema>;
export type DeviceMeta = z.infer<typeof DeviceMetaSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type LogEvent = z.infer<typeof LogEventSchema>;
export type MetricPoint = z.infer<typeof MetricPointSchema>;
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;
export type SessionLogsResponse = z.infer<typeof SessionLogsResponseSchema>;
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
export type CommandResponse = z.infer<typeof CommandResponseSchema>;
