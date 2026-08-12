// Shared upload configuration constants

export const EMPLOYEE_ID_UPLOAD = {
  maxSizeBytes: 10 * 1024 * 1024,
  allowedTypes: ["image/jpeg", "image/png"] as const,
  maxWidth: 1200,
  maxHeight: 1200,
  jpegQuality: 80,
} as const;

export const MACHINERY_DRIVER_ID_UPLOAD = {
  maxSizeBytes: 10 * 1024 * 1024,
  allowedTypes: ["image/jpeg", "image/png"] as const,
  maxWidth: 1200,
  maxHeight: 1200,
  jpegQuality: 80,
} as const;

export const CONTRACTOR_ID_UPLOAD = {
  maxSizeBytes: 10 * 1024 * 1024,
  allowedTypes: ["image/jpeg", "image/png"] as const,
  maxWidth: 1200,
  maxHeight: 1200,
  jpegQuality: 80,
} as const;
