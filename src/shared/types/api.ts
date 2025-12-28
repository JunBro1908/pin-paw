/**
 * API 응답에 대한 공통 인터페이스입니다.
 */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
