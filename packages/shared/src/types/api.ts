/** Successful API response wrapper. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Failed API response wrapper. */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/** Standard API response envelope. */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Paginated API response envelope. */
export interface PaginatedResponse<T> {
  success: true;
  data: {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
  };
}

/** Machine-readable error codes returned by all API endpoints. */
export enum ApiErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  CONNECTOR_OFFLINE = 'CONNECTOR_OFFLINE',
  QUERY_TIMEOUT = 'QUERY_TIMEOUT',
  QUERY_VALIDATION_FAILED = 'QUERY_VALIDATION_FAILED',
  SQL_ERROR = 'SQL_ERROR',
  AI_ERROR = 'AI_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
