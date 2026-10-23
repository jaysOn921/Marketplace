/** Shape of every error response returned by the API. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: 'ok';
  app: string;
  version: string;
  time: string;
}
