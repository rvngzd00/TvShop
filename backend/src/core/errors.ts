export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (resource = 'Resurs') =>
  new AppError(404, 'NOT_FOUND', `${resource} tapılmadı`);

export const forbidden = (message = 'Bu əməliyyat üçün icazəniz yoxdur') =>
  new AppError(403, 'FORBIDDEN', message);

export const conflict = (message: string) =>
  new AppError(409, 'CONFLICT', message);

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
