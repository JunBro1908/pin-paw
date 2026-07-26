/**
 * API 응답에 대한 공통 인터페이스입니다.
 *
 * @deprecated Use ApiResponse from @/shared/lib/api-response instead
 */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Re-export new types from api-response module
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse as ApiResponseNew,
} from "@/shared/lib/api-response";
export { ApiErrorCode, ok, fail } from "@/shared/lib/api-response";
