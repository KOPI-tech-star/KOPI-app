export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  requestId: string;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

export type DatabaseHealthStatus =
  | 'firestore_client_configured'
  | 'unconfigured';

export interface FirestoreHealthDiagnostics {
  provider: 'firebase_firestore';
  projectId: string | null;
  databaseId: string | null;
  clientSdkAccess: 'restricted_demo_get_only' | 'unconfigured';
  privilegedServerAccess: 'unavailable';
}

export interface HealthStatusData {
  service: 'kopi-api';
  status: 'running';
  database: DatabaseHealthStatus;
  firestore: FirestoreHealthDiagnostics;
  timestamp: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly expose: boolean;

  constructor(options: {
    statusCode: number;
    code: string;
    message: string;
    expose?: boolean;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.expose = options.expose ?? options.statusCode < 500;
  }
}
