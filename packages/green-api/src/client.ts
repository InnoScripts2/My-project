/**
 * Green API Client
 * Клиент для работы с Green API WhatsApp
 */

import type {
  GreenApiConfig,
  SendMessageOptions,
  SendFileByUrlOptions,
  SendFileByUploadOptions,
  SendLocationOptions,
  SendContactOptions,
  SendPollOptions,
  ApiResponse,
  InstanceSettings
} from './types.js';

export class GreenApiClient {
  private config: Required<GreenApiConfig>;

  constructor(config: GreenApiConfig) {
    this.config = {
      idInstance: config.idInstance,
      apiTokenInstance: config.apiTokenInstance,
      apiUrl: config.apiUrl || 'https://1105.api.green-api.com'
    };
  }

  /**
   * Формирует URL для API запроса
   */
  private buildUrl(method: string): string {
    const { apiUrl, idInstance, apiTokenInstance } = this.config;
    return `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}`;
  }

  /**
   * Выполняет POST запрос к API
   */
  private async request<T>(
    method: string,
    data: any,
    headers: Record<string, string> = {}
  ): Promise<ApiResponse<T>> {
    try {
      const url = this.buildUrl(method);
      const defaultHeaders = {
        'Content-Type': 'application/json',
        ...headers
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const result = await response.json();
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Выполняет GET запрос к API
   */
  private async getRequest<T>(method: string): Promise<ApiResponse<T>> {
    try {
      const url = this.buildUrl(method);
      const response = await fetch(url, {
        method: 'GET'
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const result = await response.json();
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Отправка текстового сообщения
   */
  async sendMessage(options: SendMessageOptions): Promise<ApiResponse> {
    return this.request('sendMessage', {
      chatId: options.chatId,
      message: options.message,
      linkPreview: options.linkPreview ?? true,
      quotedMessageId: options.quotedMessageId
    });
  }

  /**
   * Отправка файла по URL
   */
  async sendFileByUrl(options: SendFileByUrlOptions): Promise<ApiResponse> {
    return this.request('sendFileByUrl', {
      chatId: options.chatId,
      urlFile: options.urlFile,
      fileName: options.fileName,
      caption: options.caption,
      quotedMessageId: options.quotedMessageId
    });
  }

  /**
   * Отправка файла загрузкой
   */
  async sendFileByUpload(options: SendFileByUploadOptions): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('chatId', options.chatId);

    if (options.fileName) {
      formData.append('fileName', options.fileName);
    }
    if (options.caption) {
      formData.append('caption', options.caption);
    }
    if (options.quotedMessageId) {
      formData.append('quotedMessageId', options.quotedMessageId);
    }

    // Конвертируем Buffer в Blob
    const blob = new Blob([options.file]);
    formData.append('file', blob, options.fileName || 'file');

    try {
      const url = this.buildUrl('sendFileByUpload');
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const result = await response.json();
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Отправка локации
   */
  async sendLocation(options: SendLocationOptions): Promise<ApiResponse> {
    return this.request('sendLocation', {
      chatId: options.chatId,
      latitude: options.latitude,
      longitude: options.longitude,
      nameLocation: options.nameLocation,
      address: options.address
    });
  }

  /**
   * Отправка контакта
   */
  async sendContact(options: SendContactOptions): Promise<ApiResponse> {
    return this.request('sendContact', {
      chatId: options.chatId,
      contact: options.contact,
      quotedMessageId: options.quotedMessageId
    });
  }

  /**
   * Отправка опроса
   */
  async sendPoll(options: SendPollOptions): Promise<ApiResponse> {
    return this.request('sendPoll', {
      chatId: options.chatId,
      message: options.message,
      options: options.options,
      multipleAnswers: options.multipleAnswers ?? false
    });
  }

  /**
   * Получение настроек инстанса
   */
  async getSettings(): Promise<ApiResponse<InstanceSettings>> {
    return this.getRequest<InstanceSettings>('getSettings');
  }

  /**
   * Получение входящих уведомлений
   */
  async receiveNotification(): Promise<ApiResponse> {
    return this.getRequest('receiveNotification');
  }

  /**
   * Удаление уведомления
   */
  async deleteNotification(receiptId: string): Promise<ApiResponse> {
    return this.request('deleteNotification', { receiptId });
  }

  /**
   * Загрузка файла
   */
  async downloadFile(chatId: string, idMessage: string): Promise<ApiResponse> {
    return this.request('downloadFile', { chatId, idMessage });
  }

  /**
   * Пересылка сообщений
   */
  async forwardMessages(
    chatId: string,
    chatIdFrom: string,
    messages: string[]
  ): Promise<ApiResponse> {
    return this.request('forwardMessages', {
      chatId,
      chatIdFrom,
      messages
    });
  }

  /**
   * Отправка интерактивных кнопок
   */
  async sendInteractiveButtons(
    chatId: string,
    message: string,
    footer: string,
    buttons: Array<{ buttonId: string; buttonText: string }>
  ): Promise<ApiResponse> {
    return this.request('sendInteractiveButtons', {
      chatId,
      message,
      footer,
      buttons
    });
  }

  /**
   * Отправка ответа на интерактивные кнопки
   */
  async sendInteractiveButtonsReply(
    chatId: string,
    message: string,
    quotedMessageId: string
  ): Promise<ApiResponse> {
    return this.request('sendInteractiveButtonsReply', {
      chatId,
      message,
      quotedMessageId
    });
  }
}
