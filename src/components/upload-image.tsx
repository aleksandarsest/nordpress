import Image from "next/image";
import { mediaUrl } from "@/lib/media";

// An uploaded image served through the optimizer (resized WebP/AVIF, lazy
// loading). Falls back to a plain <img> when dimensions are unknown.
export function UploadImage({
  path,
  alt,
  width,
  height,
  sizes,
  className,
  priority,
}: {
  path: string;
  alt: string;
  width: number | null;
  height: number | null;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const src = mediaUrl(path);
  if (!width || !height) {
    return (
      // biome-ignore lint/performance/noImgElement: dimensions unknown, so the optimizer can't size it
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={className}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      className={className}
      priority={priority}
    />
  );
}
