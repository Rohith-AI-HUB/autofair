import Link from 'next/link';
import Image from 'next/image';
import type { Car } from '@/types';
import { carTitle, formatKm, formatPrice } from '@/lib/data/cars';

export function CarCard({
  car,
  index,
}: {
  car: Car;
  index: number;
}) {
  const num = String(index + 1).padStart(2, '0');
  return (
    <article className="flex flex-col gap-4 border border-line bg-white p-4 sm:flex-row sm:items-center md:p-5">
      <p className="font-mono text-[13px] text-[#999]" aria-hidden>
        {num}
      </p>
      <Link
        href={`/cars/${car.slug}`}
        className="relative block h-[160px] w-full shrink-0 overflow-hidden bg-off-white sm:h-[120px] sm:w-[180px]"
        aria-label={`Open file for ${carTitle(car)}`}
      >
        <Image
          src={car.images[0]}
          alt={`${carTitle(car)} — ${car.location}, verified photo`}
          fill
          className="object-contain"
          sizes="(max-width: 640px) 100vw, 180px"
          loading="lazy"
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/cars/${car.slug}`} className="hover:underline">
          <h3 className="font-sans text-[18px] font-extrabold text-navy">
            {carTitle(car)}
          </h3>
        </Link>
        <p className="font-sans text-[22px] font-extrabold text-navy">
          {formatPrice(car.price)}
        </p>
        <p className="font-sans text-[13px] text-muted">
          {formatKm(car.mileageKm)} · {car.fuel} · {car.transmission} · {car.location}
        </p>
        <p className="font-mono text-[11px] tracking-[0.02em] text-teal-dark">
          {car.inspectionId}
          &nbsp;&nbsp;•&nbsp;&nbsp;INSP ✓&nbsp;&nbsp;DOCS{' '}
          {car.docsPending ? '⚠ 1 PENDING' : '✓'}
          &nbsp;&nbsp;HIST {car.verification.accidentHistory}
        </p>
      </div>
      <Link
        href={`/cars/${car.slug}`}
        className="inline-flex shrink-0 items-center justify-center bg-navy px-5 py-3 font-sans text-[13px] font-bold text-white hover:bg-navy-2"
      >
        Open file →
      </Link>
    </article>
  );
}
