import type { Car } from '@/types';
import { CarCard } from '@/components/cars/CarCard';

export function CarGrid({ cars }: { cars: Car[] }) {
  return (
    <div className="flex flex-col gap-[18px]">
      {cars.map((car, i) => (
        <CarCard key={car.id} car={car} index={i} />
      ))}
    </div>
  );
}
