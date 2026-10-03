"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  PhotoIcon,
} from "@/components/shared/icons";
import type { FeedPhoto } from "@/utils/supabase/posts";

interface PostPhotoGalleryProps {
  photos: FeedPhoto[];
}

function getDesktopGrid(count: number): string {
  switch (count) {
    case 1:
      return "md:grid-cols-1";
    case 2:
      return "md:grid-cols-2";
    case 3:
      return "md:grid-cols-2 md:grid-rows-2";
    case 4:
      return "md:grid-cols-2 md:grid-rows-2";
    case 5:
      return "md:grid-cols-2 md:grid-rows-3";
    default:
      return "md:grid-cols-3";
  }
}

function getTileClasses(index: number, count: number): string {
  if (count === 1) return "aspect-[4/3]";
  if (count === 3 && index === 0) return "md:row-span-2 aspect-square";
  if (count === 5 && index === 4) return "md:col-span-2 aspect-[16/9]";
  return "aspect-square";
}

export function PostPhotoGallery({ photos }: PostPhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLightboxIndex(null);
        return;
      }
      if (event.key === "ArrowLeft") {
        setLightboxIndex((i) =>
          i === null ? null : (i - 1 + photos.length) % photos.length,
        );
      }
      if (event.key === "ArrowRight") {
        setLightboxIndex((i) =>
          i === null ? null : (i + 1) % photos.length,
        );
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [lightboxIndex, photos.length]);

  if (photos.length === 0) {
    return (
      <div className="mt-3.5 flex h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-photo-placeholder-border bg-photo-placeholder-bg text-photo-placeholder-fg">
        <PhotoIcon className="h-[30px] w-[30px]" />
        <span className="text-[13.5px]">Sin fotos</span>
      </div>
    );
  }

  return (
    <>
      <div
        className={`mt-3.5 grid grid-cols-1 gap-1.5 ${getDesktopGrid(photos.length)}`}
      >
        {photos.map((photo, i) => (
          <button
            key={photo.url}
            type="button"
            onClick={() => setLightboxIndex(i)}
            aria-label={`Abrir foto ${i + 1} de ${photos.length}`}
            className={`group relative overflow-hidden rounded-2xl border border-border bg-photo-placeholder-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${getTileClasses(i, photos.length)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.02]"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null ? (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() =>
            setLightboxIndex((i) =>
              i === null ? null : (i - 1 + photos.length) % photos.length,
            )
          }
          onNext={() =>
            setLightboxIndex((i) =>
              i === null ? null : (i + 1) % photos.length,
            )
          }
        />
      ) : null}
    </>
  );
}

interface LightboxProps {
  photos: FeedPhoto[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

function Lightbox({ photos, index, onClose, onPrev, onNext }: LightboxProps) {
  const photo = photos[index];

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visor de imagen"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar visor"
        className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <CloseIcon className="h-5 w-5" />
      </button>

      <div
        className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-12"
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt=""
          className="max-h-full max-w-full rounded-2xl object-contain"
        />
      </div>

      {photos.length > 1 ? (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPrev();
            }}
            aria-label="Foto anterior"
            className="absolute left-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-4"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onNext();
            }}
            aria-label="Foto siguiente"
            className="absolute right-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4"
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
          <div
            aria-live="polite"
            className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 font-display text-[12.5px] font-semibold tabular-nums text-white"
          >
            {index + 1}/{photos.length}
          </div>
        </>
      ) : null}
    </div>,
    document.body,
  );
}