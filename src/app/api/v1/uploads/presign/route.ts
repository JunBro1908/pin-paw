import { NextResponse } from "next/server";
import { createServerSupabase } from "@/shared/supabase/server";
import { getClientIp } from "@/shared/lib/ip";
import { sha256 } from "@/shared/lib/hash";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png"];
const SCOPE = "uploads:presign";

const BUCKET_MAPPING = {
  sighting_photo: "sightings",
  lost_cover: "lost",
};

export async function POST(request: Request) {
  const supabase = createServerSupabase();

  try {
    const { purpose, files } = await request.json();

    // 1. 요청 검증
    if (!BUCKET_MAPPING[purpose as keyof typeof BUCKET_MAPPING]) {
      return NextResponse.json(
        { success: false, error: "잘못된 업로드 목적(purpose)입니다." },
        { status: 400 }
      );
    }
    if (!Array.isArray(files) || files.length < 1 || files.length > 3) {
      return NextResponse.json(
        { success: false, error: "파일은 1개에서 3개까지 업로드 가능합니다." },
        { status: 400 }
      );
    }

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.contentType)) {
        return NextResponse.json(
          { success: false, error: "허용되지 않는 파일 형식입니다." },
          { status: 400 }
        );
      }
      if (file.sizeBytes > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: "파일 크기는 10MB를 초과할 수 없습니다." },
          { status: 400 }
        );
      }
    }

    // 2. 사용자 식별 및 속도 제한
    const {
      data: { user },
    } = await supabase.auth.getUser(
      request.headers.get("Authorization")?.replace("Bearer ", "") || ""
    );
    const userId = user?.id || null;
    const ip = await getClientIp();
    const ipHash = sha256(ip);

    const idempotencyKey =
      request.headers.get("Idempotency-Key") || crypto.randomUUID();
    const requestHash = sha256(
      JSON.stringify({ purpose, files, userId, ipHash })
    );

    // 멱등성 체크: 키가 이미 존재하는지 확인 (request_hash도 반드시 포함!)
    const { data: cached } = await supabase
      .from("idempotency_keys")
      .select("response, request_hash")
      .eq("scope", SCOPE)
      .eq("key", idempotencyKey)
      .maybeSingle();

    if (cached) {
      // 1. 키는 같은데 내용(파일 등)이 다른 경우 -> 409 충돌!
      if (cached.request_hash !== requestHash) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Idempotency-Key 충돌이 발생했습니다. 동일한 키로 다른 데이터를 전송할 수 없습니다.",
          },
          { status: 409 }
        );
      }
      // 2. 키도 같고 내용도 같은 경우 -> 기존 응답 그대로 반환 (성공)
      return NextResponse.json(cached.response);
    }

    // Rate Limit 체크 (10초 쿨다운 등)
    const now = new Date();
    const tenSecAgo = new Date(now.getTime() - 10000).toISOString();
    const { count: recentCount } = await supabase
      .from("idempotency_keys")
      .select("*", { count: "exact", head: true })
      .eq("scope", SCOPE)
      .match(userId ? { owner_id: userId } : { ip_hash: ipHash })
      .gt("created_at", tenSecAgo);

    if (recentCount && recentCount > 0) {
      return NextResponse.json(
        { success: false, error: "잠시 후 다시 시도해주세요. (10초 쿨다운)" },
        { status: 429 }
      );
    }

    // 3. Presigned URL 생성
    const uploads = [];
    const dateStr = now.toISOString().split("T")[0].replace(/-/g, "");
    const bucket = BUCKET_MAPPING[purpose as keyof typeof BUCKET_MAPPING];

    for (const file of files) {
      const ext = file.contentType === "image/jpeg" ? "jpg" : "png";
      const fileKey = `${purpose}/${dateStr}/${crypto.randomUUID()}.${ext}`;

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(fileKey);

      if (error) throw error;

      uploads.push({
        fileKey,
        uploadUrl: data.signedUrl,
        expiresInSec: 600,
      });
    }

    const finalResponse = {
      success: true,
      data: { uploads },
      meta: { serverTime: now.toISOString() },
      error: null,
    };

    // 4. 결과 저장 (멱등성)
    const { error: idempotencyError } = await supabase
      .from("idempotency_keys")
      .insert({
        scope: SCOPE,
        key: idempotencyKey,
        owner_id: userId,
        ip_hash: ipHash,
        request_hash: requestHash,
        response: finalResponse,
        expires_at: new Date(now.getTime() + 86400000).toISOString(),
      });

    if (idempotencyError) {
      console.error("Idempotency Save Error:", idempotencyError);
      // 키 형식이 틀렸거나 DB 오류가 나면 여기서 에러를 확인할 수 있습니다.
      return NextResponse.json(
        {
          success: false,
          error: `보안 키 저장 실패: ${idempotencyError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(finalResponse);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
