/**
 * HttpProtocol — Core abstraction for HTTP communication.
 *
 * Infrastructure layer provides the concrete implementation (e.g. Axios, fetch).
 * Core layer only depends on this interface.
 */

export interface RequestConfig {
  readonly headers?: Record<string, string>;
  readonly params?: Record<string, string | number | boolean>;
  readonly timeout?: number;
}

export interface HttpProtocol {
  get<T>(url: string, config?: RequestConfig): Promise<T>;
  post<T>(url: string, body: unknown, config?: RequestConfig): Promise<T>;
  put<T>(url: string, body: unknown, config?: RequestConfig): Promise<T>;
  patch<T>(url: string, body: unknown, config?: RequestConfig): Promise<T>;
  delete<T>(url: string, config?: RequestConfig): Promise<T>;
}
