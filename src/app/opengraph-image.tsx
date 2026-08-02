import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_COPY } from "@/shared/constants/site-copy";

export const runtime = "nodejs";
export const alt = SITE_COPY.ogImageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card: public/brand/og.png */
export default async function OpenGraphImage() {
  const bytes = await readFile(join(process.cwd(), "public/brand/og.png"));
  const src = `data:image/png;base64,${bytes.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#FAFCFA",
      }}
    >
      <img
        src={src}
        width={1200}
        height={630}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>,
    { ...size }
  );
}
