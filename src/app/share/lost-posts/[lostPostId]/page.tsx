import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createServiceRoleSupabase } from "@/shared/supabase/server";
import {
  assertSharePreviewIsSafe,
  buildLostPostSharePreview,
  buildOpenGraphDescription,
  buildShareTraitLabels,
} from "@/shared/lib/share-preview";
import { isValidUuid } from "@/shared/lib/api-input";
import { parseAppOrigin } from "@/shared/lib/app-origin";
import { Text } from "@/shared/ui/Text";
import { Container } from "@/shared/ui/Container";
import { Icon } from "@/shared/ui/Icon";
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

function ShareUnavailable() {
  return (
    <Container className="flex min-h-[100dvh] flex-col justify-center gap-6 py-10">
      <div className="flex items-center gap-2">
        <Icon name="paw" size={22} className="text-status-lost" />
        <Text variant="body" className="font-semibold">
          PinPaw
        </Text>
      </div>
      <div>
        <Text variant="title" className="block">
          공유할 수 없는 유실글이에요
        </Text>
        <Text variant="body" color="caption" className="mt-2 block">
          찾을 수 없거나 종료·비공개된 제보일 수 있어요. PinPaw에서 다른
          제보를 확인하거나 직접 제보해 주세요.
        </Text>
      </div>
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="bg-action-primary text-action-on-primary inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-center font-semibold"
        >
          홈으로 가기
        </Link>
        <Link
          href="/my"
          className="border-border-subtle bg-surface text-text-main inline-flex min-h-12 items-center justify-center rounded-xl border px-4 py-3 text-center font-semibold"
        >
          로그인하고 시작하기
        </Link>
      </div>
    </Container>
  );
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
  if (!preview) return <ShareUnavailable />;

  const traits = buildShareTraitLabels(preview);
  const coverUrl = coverPublicUrl(preview.coverPhotoKey);
  const petName = preview.petName ?? "강아지";

  return (
    <Container className="flex min-h-[100dvh] flex-col gap-6 py-10">
      <ShareOpenedTracker lostPostId={preview.id} />

      <div className="flex items-center gap-2">
        <Icon name="paw" size={22} className="text-status-lost" />
        <Text variant="body" className="font-semibold tracking-tight">
          PinPaw
        </Text>
      </div>

      {coverUrl ? (
        <div className="bg-surface-soft relative aspect-[4/3] w-full overflow-hidden rounded-2xl">
          <Image
            src={coverUrl}
            alt={`${petName} 대표 사진`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 480px"
            unoptimized
            priority
          />
        </div>
      ) : (
        <div className="bg-surface-soft text-text-caption flex aspect-[4/3] w-full items-center justify-center rounded-2xl">
          <Icon name="paw" size={40} className="text-status-lost/70" />
        </div>
      )}

      <div>
        <Text variant="title" className="block">
          {petName}를 찾고 있습니다
        </Text>
        {traits.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {traits.map((label) => (
              <li
                key={label}
                className="bg-surface-soft text-text-sub rounded-lg px-2.5 py-1 text-xs font-medium"
              >
                {label}
              </li>
            ))}
          </ul>
        ) : null}
        <Text variant="caption" color="caption" className="mt-4 block">
          정확한 위치와 비공개 메모는 공유되지 않습니다. 로그인하면 지도에서
          제보를 이어 볼 수 있어요.
        </Text>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <Link
          href="/"
          className="bg-action-primary text-action-on-primary inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-center font-semibold"
        >
          목격 제보하기
        </Link>
        <Link
          href="/my"
          className="border-border-subtle bg-surface text-text-main inline-flex min-h-12 items-center justify-center rounded-xl border px-4 py-3 text-center font-semibold"
        >
          로그인하고 함께 찾기
        </Link>
      </div>
    </Container>
  );
}
