export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export class DatabaseUnavailableError extends ApiError {
  constructor(message = 'The database is unavailable. Check DATABASE_URL and run npm run db:migrate.') {
    super(503, 'DATABASE_UNAVAILABLE', message);
    this.name = 'DatabaseUnavailableError';
  }
}
