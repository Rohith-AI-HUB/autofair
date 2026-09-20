import type { Car } from '@/types';
import { carTitle, formatKm, formatPrice } from '@/lib/data/cars';
import { SellerContact } from '@/components/cars/SellerContact';

export function VehicleSummary({ car }: { car: Car }) {
  return (
    <div className="border border-line bg-white p-6">
      <p className="font-mono text-[11px] tracking-[0.06em] text-teal-dark">
        DOSSIER&nbsp;&nbsp;•&nbsp;&nbsp;{car.inspectionId}&nbsp;&nbsp;•&nbsp;&nbsp;VERIFIED
      </p>
      <h1 className="mt-2 font-sans text-[30px] font-extrabold leading-tight text-navy md:text-[38px]">
        {carTitle(car)}
      </h1>
      <p className="mt-1 font-mono text-[11px] text-muted">
        {car.registration}&nbsp;&nbsp;•&nbsp;&nbsp;{car.location}
      </p>
      <p className="mt-4 font-sans text-[32px] font-extrabold text-navy">
        {formatPrice(car.price)}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 font-sans text-[13px] md:grid-cols-3">
        {[
          ['Year', String(car.year)],
          ['Kilometres', formatKm(car.mileageKm)],
          ['Fuel', car.fuel],
          ['Transmission', car.transmission],
          ['Ownership', car.ownership],
          ['Location', car.location],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="font-mono text-[10.5px] tracking-[0.06em] text-muted">
              {k.toUpperCase()}
            </dt>
            <dd className="mt-1 font-semibold text-navy">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 border border-teal-line bg-teal-bg p-4">
        <p className="font-sans text-[12px] font-extrabold text-teal-dark">
          ● AUTOFAIR VERIFIED
        </p>
        <ul className="mt-2 space-y-1 font-sans text-[13px] text-navy">
          <li>✓ Inspection {car.verification.inspection}</li>
          <li>✓ Documents {car.verification.documents}</li>
          <li>✓ Accident history {car.verification.accidentHistory}</li>
        </ul>
      </div>

      <div className="mt-4">
        <SellerContact vehicleId={car.id} inspectionId={car.inspectionId} variant="dossier" />
      </div>
    </div>
  );
}
