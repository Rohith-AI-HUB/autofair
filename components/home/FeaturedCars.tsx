import { Container } from '@/components/shared/Container';
import { CarCard } from '@/components/cars/CarCard';
import { cars } from '@/lib/data/cars';

export function FeaturedCars() {
  const featured = cars.slice(0, 4);
  return (
    <section aria-labelledby="featured-heading" className="bg-off-white">
      <Container className="py-16">
        <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
          02 — INDEX&nbsp;&nbsp;/&nbsp;&nbsp;FOUR DOSSIERS&nbsp;&nbsp;•&nbsp;&nbsp;VERIFICATION
          UPFRONT
        </p>
        <h2
          id="featured-heading"
          className="mt-3 max-w-[640px] font-sans text-[32px] font-extrabold leading-[1.08] tracking-[-0.02em] text-navy md:text-[42px]"
        >
          Cars worth taking a closer look at.
        </h2>
        <p className="mt-3 max-w-[560px] font-sans text-[15px] leading-relaxed text-muted">
          A ledger, not a carousel. Each file shows price, history and checks before you
          contact the seller.
        </p>
        <div className="mt-8 flex flex-col gap-[18px]">
          {featured.map((car, i) => (
            <CarCard key={car.id} car={car} index={i} />
          ))}
        </div>
      </Container>
    </section>
  );
}
