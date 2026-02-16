import { NextResponse } from "next/server";

/**
 * API 에러 코드 표준
 */
export enum ApiErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  RATE_LIMITED = "RATE_LIMITED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  UPSTREAM_ERROR = "UPSTREAM_ERROR",
  INVALID_PARAMS = "INVALID_PARAMS",
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
}

/**
 * API 성공 응답 타입
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    [key: string]: unknown;
  };
}

/**
 * API 에러 응답 타입
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/**
 * API 응답 유니온 타입
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * 성공 응답 헬퍼 함수
 *
 * @example
 * return ok({ items: [] }, { total: 0 })
 */
export function ok<T>(
  data: T,
  meta?: { [key: string]: unknown }
): NextResponse<ApiSuccessResponse<T>> {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(meta && { meta }),
  };

  return NextResponse.json(response);
}

/**
 * 에러 응답 헬퍼 함수
 *
 * @example
 * return fail(ApiErrorCode.VALIDATION_ERROR, "Invalid input", 400)
 */
export function fail(
  code: ApiErrorCode | string,
  message: string,
  status: number,
  headers?: HeadersInit
): NextResponse<ApiErrorResponse> {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };

  return NextResponse.json(response, { status, headers });
}

/**
 * 에러 응답 헬퍼 함수 (헤더 포함)
 *
 * @example
 * return failWithHeaders(ApiErrorCode.RATE_LIMITED, "Too many requests", 429, {
 *   'Retry-After': '60'
 * })
 */
export function failWithHeaders(
  code: ApiErrorCode | string,
  message: string,
  status: number,
  headers: HeadersInit
): NextResponse<ApiErrorResponse> {
  return fail(code, message, status, headers);
}

/**
 * 304 Not Modified 응답
 */
export function notModified(): NextResponse {
  return new NextResponse(null, { status: 304 });
}
