'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CarouselImage {
  src: string;
  alt: string;
}

interface ImageCarouselProps {
  images: CarouselImage[];
  figLabel?: string;
  autoplayMs?: number | false;
  className?: string;
}

export function ImageCarousel({
  images,
  figLabel,
  autoplayMs = 6000,
  className,
}: ImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const [animated, setAnimated] = useState(true);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = images.length;
  const visible = count === 0 ? 0 : index % count;
  const slides = count > 1 ? [...images, { ...images[0], alt: '' }] : images;

  const goTo = useCallback(
    (i: number) => {
      if (count === 0) return;
      setAnimated(true);
      setIndex(((i % count) + count) % count);
    },
    [count]
  );

  const next = useCallback(() => {
    if (count <= 1) return;
    setAnimated(true);
    setIndex((prev) => (prev >= count ? prev : prev + 1));
  }, [count]);

  useEffect(() => {
    if (index !== count || count <= 1) return;
    const t = window.setTimeout(() => {
      setAnimated(false);
      setIndex(0);
    }, 520);
    return () => window.clearTimeout(t);
  }, [index, count]);

  useEffect(() => {
    if (autoplayMs === false || paused || count <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setTimeout(next, autoplayMs);
    return () => window.clearTimeout(t);
  }, [autoplayMs, paused, count, index, next]);

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={figLabel ?? 'Featured vehicle photos'}
      className={cn('absolute inset-0 h-full w-full overflow-hidden bg-navy', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') next();
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) next();
        touchX.current = null;
      }}
    >
      <div
        className={cn(
          'flex h-full w-full',
          animated && 'transition-transform duration-500 ease-out'
        )}
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((img, i) => (
          <div
            key={`${img.src}-${i}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${(i % count) + 1} of ${count}`}
            aria-hidden={i !== index}
            className="relative h-full w-full shrink-0 grow-0 basis-full"
          >
            <Image
              src={img.src}
              alt={img.alt}
              fill
              priority={i === 0}
              loading={i === 0 ? undefined : 'lazy'}
              className="object-cover"
              sizes="100vw"
            />
          </div>
        ))}
      </div>

      {figLabel ? (
        <p className="absolute left-5 top-5 font-mono text-[10px] tracking-[0.06em] text-white md:left-12">
          FIG. {String(visible + 1).padStart(2, '0')} — {figLabel}
        </p>
      ) : null}

      <p aria-live="polite" className="sr-only">
        Photo {visible + 1} of {count}
      </p>

      {count > 1 ? (
        <>
          <div className="absolute bottom-6 left-5 flex gap-2 md:left-12">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to photo ${i + 1}`}
                aria-current={i === visible}
                className={cn(
                  'h-2 w-2 rounded-full',
                  i === visible ? 'bg-amber' : 'bg-white/50 hover:bg-white'
                )}
              />
            ))}
          </div>

          <div className="absolute bottom-6 right-5 hidden sm:flex md:right-12">
            <button
              type="button"
              onClick={next}
              aria-label="Next photo"
              className="flex h-11 w-11 items-center justify-center border border-white/20 bg-navy/70 text-white hover:bg-navy"
            >
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
