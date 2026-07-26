import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleSupabase } from "@/shared/supabase/server";
import {
  assertSharePreviewIsSafe,
  buildLostPostSharePreview,
  buildOpenGraphDescription,
} from "@/shared/lib/share-preview";
import { isValidUuid } from "@/shared/lib/api-input";
import { parseAppOrigin } from "@/shared/lib/app-origin";
import { Text } from "@/shared/ui/Text";
import { Container } from "@/shared/ui/Container";
import { ShareOpenedTracker } from "@/features/lost-posts/components/ShareOpenedTracker";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ lostPostId: string }>;
};

function appOrigin(): string | null {
  const result = parseAppOrigin(process.env.APP_ORIGIN);
  return result.ok ? result.origin : null;
}

function absoluteUrl(path: string): string | undefined {
  const origin = appOrigin();
  if (!origin) return undefined;
  return new URL(path, origin).toString();
}

function coverPublicUrl(coverPhotoKey: string | null): string | null {
  if (!coverPhotoKey) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/lost/${coverPhotoKey}`;
}

async function loadPreview(lostPostId: string) {
  if (!isValidUuid(lostPostId)) return null;
  const supabase = createServiceRoleSupabase();
  const { data, error } = await supabase.rpc(
    "get_public_lost_post_share_preview",
    { p_lost_post_id: lostPostId }
  );
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const preview = buildLostPostSharePreview({
    id: row.id,
    status: row.status,
    pet_name: row.pet_name,
    lost_at: row.lost_at,
    trait_color: row.trait_color,
    trait_size: row.trait_size,
    trait_species: row.trait_species,
    trait_tags: row.trait_tags,
    cover_photo_key: row.cover_photo_key,
    hidden_at: null,
    archived_at: null,
    lat: row.approx_lat,
    lng: row.approx_lng,
  });
  if (!preview) return null;
  assertSharePreviewIsSafe(preview as unknown as Record<string, unknown>);
  return preview;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lostPostId } = await params;
  const preview = await loadPreview(lostPostId);
  if (!preview) {
    return {
      title: "PinPaw",
      description: "실종 반려동물 찾기",
      robots: { index: false, follow: false },
    };
  }

  const title = `${preview.petName ?? "강아지"} · PinPaw`;
  const description = buildOpenGraphDescription(preview);
  const image = coverPublicUrl(preview.coverPhotoKey);
  const origin = appOrigin();
  const shareUrl = absoluteUrl(preview.sharePath);
  return {
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(shareUrl ? { url: shareUrl } : {}),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ShareLostPostPage({ params }: PageProps) {
  const { lostPostId } = await params;
  const preview = await loadPreview(lostPostId);
  if (!preview) notFound();

  const traits = [preview.traitColor, preview.traitSize, preview.traitSpecies]
    .filter(Boolean)
    .join(" · ");
  const coverUrl = coverPublicUrl(preview.coverPhotoKey);

  return (
    <Container className="flex min-h-[100dvh] flex-col justify-center gap-6 py-10">
      <ShareOpenedTracker lostPostId={preview.id} />
      {coverUrl ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gray-100">
          <Image
            src={coverUrl}
            alt={`${preview.petName ?? "강아지"} 대표 사진`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 480px"
            unoptimized
          />
        </div>
      ) : null}
      <div>
        <Text variant="caption" color="caption">
          PinPaw 공유 미리보기
        </Text>
        <Text variant="title" className="mt-2">
          {preview.petName ?? "강아지"}를 찾고 있습니다
        </Text>
        {traits ? (
          <Text variant="body" className="mt-2 text-gray-600">
            {traits}
          </Text>
        ) : null}
        <Text variant="caption" color="caption" className="mt-4 block">
          정확한 위치와 비공개 메모는 공유되지 않습니다.
        </Text>
      </div>
      <Link
        href={
          preview.approximateArea
            ? `/map?lat=${preview.approximateArea.lat}&lng=${preview.approximateArea.lng}`
            : "/"
        }
        className="bg-primary inline-flex items-center justify-center rounded-lg px-4 py-3 font-semibold text-white"
      >
        PinPaw에서 보기
      </Link>
    </Container>
  );
}
