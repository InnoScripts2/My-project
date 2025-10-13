/**
 * Типы для Green API
 */

export interface GreenApiConfig {
  idInstance: string;
  apiTokenInstance: string;
  apiUrl?: string;
}

export interface SendMessageOptions {
  chatId: string;
  message: string;
  linkPreview?: boolean;
  quotedMessageId?: string;
}

export interface SendFileOptions {
  chatId: string;
  fileName?: string;
  caption?: string;
  quotedMessageId?: string;
}

export interface SendFileByUrlOptions extends SendFileOptions {
  urlFile: string;
}

export interface SendFileByUploadOptions extends SendFileOptions {
  file: Buffer | Uint8Array;
}

export interface SendLocationOptions {
  chatId: string;
  latitude: number;
  longitude: number;
  nameLocation?: string;
  address?: string;
}

export interface SendContactOptions {
  chatId: string;
  contact: {
    phoneContact: string;
    firstName: string;
    middleName?: string;
    lastName?: string;
    company?: string;
  };
  quotedMessageId?: string;
}

export interface SendPollOptions {
  chatId: string;
  message: string;
  options: string[];
  multipleAnswers?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface MessageStatus {
  idMessage: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: number;
}

export interface InstanceSettings {
  wid: string;
  countryInstance: string;
  delaySendMessagesMilliseconds: number;
  markIncomingMessagesReaded: string;
  outgoingWebhook: string;
  incomingWebhook: string;
  keepOnlineStatus: string;
  proxyInstance: string;
  sharedSession: string;
  statusInstanceWebhook: string;
  webhookUrl: string;
  webhookUrlToken: string;
}
