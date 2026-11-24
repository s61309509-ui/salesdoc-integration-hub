export class SalesDocBaseError extends Error {
  public readonly code: number | string;
  public readonly details: any;
  public readonly retryable: boolean;

  constructor(message: string, code: number | string = 'SALESDOC_ERROR', details: any = null, retryable: boolean = false) {
    super(message);
    this.name = 'SalesDocBaseError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SalesDocApiError extends SalesDocBaseError {
  constructor(message: string = 'SalesDoc API error occurred', code: number = 400, details: any = null) {
    super(`SalesDoc API Error [${code}]: ${message}`, code, details, false);
    this.name = 'SalesDocApiError';
    Object.setPrototypeOf(this, SalesDocApiError.prototype);
  }
}

export class SalesDocUnauthorizedError extends SalesDocBaseError {
  constructor(message: string = 'Unauthorized: Invalid token or user not found', details: any = null) {
    super(`SalesDoc Auth Error [401]: ${message}`, 401, details, false);
    this.name = 'SalesDocUnauthorizedError';
    Object.setPrototypeOf(this, SalesDocUnauthorizedError.prototype);
  }
}

export class SalesDocForbiddenError extends SalesDocBaseError {
  constructor(message: string = 'Forbidden: Access denied by SalesDoc server', details: any = null) {
    super(`SalesDoc Forbidden [403]: ${message}`, 403, details, false);
    this.name = 'SalesDocForbiddenError';
    Object.setPrototypeOf(this, SalesDocForbiddenError.prototype);
  }
}

export class SalesDocRateLimitError extends SalesDocBaseError {
  constructor(message: string = 'Rate limit exceeded for method', code: number = 429, details: any = null) {
    super(`SalesDoc Rate Limit [${code}]: ${message}`, code, details, true);
    this.name = 'SalesDocRateLimitError';
    Object.setPrototypeOf(this, SalesDocRateLimitError.prototype);
  }
}

export class SalesDocValidationError extends SalesDocBaseError {
  public readonly validationErrors: string[];
  constructor(message: string, validationErrors: string[] = [], details: any = null) {
    super(`SalesDoc Validation Error: ${message}`, 'VALIDATION_ERROR', { validationErrors, ...details }, false);
    this.name = 'SalesDocValidationError';
    this.validationErrors = validationErrors;
  }
}

export class SalesDocNetworkError extends SalesDocBaseError {
  constructor(message: string, originalError?: any) {
    super(`SalesDoc Network Failure: ${message}`, 'NETWORK_ERROR', originalError, true);
    this.name = 'SalesDocNetworkError';
  }
}

export class SalesDocTimeoutError extends SalesDocBaseError {
  constructor(timeoutMs: number) {
    super(`SalesDoc Request timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR', { timeoutMs }, true);
    this.name = 'SalesDocTimeoutError';
  }
}

export class DuplicateOrderError extends SalesDocBaseError {
  public readonly localOrderId: string;
  public readonly existingSalesDocId?: string;
  public readonly code1C?: string;

  constructor(localOrderId: string, existingSalesDocId?: string, code1C?: string) {
    super(
      `Order already synced or pending: localId=${localOrderId}, SD_id=${existingSalesDocId || 'N/A'}, code_1C=${code1C || 'N/A'}`,
      'DUPLICATE_ORDER',
      { localOrderId, existingSalesDocId, code1C },
      false
    );
    this.name = 'DuplicateOrderError';
    this.localOrderId = localOrderId;
    this.existingSalesDocId = existingSalesDocId;
    this.code1C = code1C;
  }
}
