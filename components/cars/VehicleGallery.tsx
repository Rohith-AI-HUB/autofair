'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export function VehicleGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  return (
    <div>
      <div className="relative h-[320px] w-full overflow-hidden bg-navy md:h-[440px]">
        <Image
          key={current}
          src={current}
          alt={`${title} — photo ${active + 1}`}
          fill
          priority
          className="object-contain"
          sizes="(max-width: 1024px) 100vw, 60vw"
        />
        <p className="absolute left-4 top-4 bg-navy/80 px-2 py-1 font-mono text-[10px] text-white">
          FIG. {String(active + 1).padStart(2, '0')}
        </p>
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-3" role="tablist" aria-label="Vehicle photos">
          {images.map((src, i) => (
            <button
              key={src + i}
              role="tab"
              aria-selected={active === i}
              aria-label={`View photo ${i + 1}`}
              onClick={() => setActive(i)}
              className={cn(
                'relative h-[72px] w-[110px] overflow-hidden border-2 bg-off-white',
                active === i ? 'border-teal' : 'border-transparent opacity-70 hover:opacity-100'
              )}
            >
              <Image
                src={src}
                alt=""
                fill
                className="object-contain"
                sizes="110px"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
