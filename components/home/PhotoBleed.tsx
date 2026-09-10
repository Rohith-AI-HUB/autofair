import Image from 'next/image';

export function PhotoBleed() {
  return (
    <section aria-label="Featured verified vehicle" className="relative overflow-hidden bg-navy">
      <div className="relative h-[560px] w-full md:h-[640px]">
        <Image
          src="https://images.unsplash.com/photo-1781197824875-c6e07188896b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1800"
          alt="2022 Hyundai Creta SX — KA-05-MN-4218 in Bangalore, sample dossier vehicle"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/40" />

        <p className="absolute left-5 top-5 font-mono text-[10px] tracking-[0.06em] text-white md:left-12">
          FIG. 01 — CRETA SX · KA-05-MN-4218 · BANGALORE
        </p>

        <div className="absolute bottom-6 left-5 flex gap-2 md:left-12" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-amber" />
          <span className="h-2 w-2 rounded-full bg-white/50" />
          <span className="h-2 w-2 rounded-full bg-white/50" />
          <span className="h-2 w-2 rounded-full bg-white/50" />
        </div>

        <div className="absolute inset-x-5 bottom-14 top-auto md:inset-x-auto md:bottom-auto md:right-12 md:top-1/2 md:w-[520px] md:-translate-y-1/2 md:left-auto">
          <div className="border border-white/10 bg-navy p-7">
            <div className="flex items-center justify-between">
              <p className="font-sans text-[12px] font-extrabold tracking-[0.06em] text-teal">
                ● AUTOFAIR VERIFIED
              </p>
              <p className="font-mono text-[10px] tracking-[0.08em] text-[#999]">
                SAMPLE
              </p>
            </div>
            <ul className="mt-4 space-y-3">
              {[
                'Inspection completed — 82 / 82',
                'Documents reviewed — RC · Insurance',
                'Accident history disclosed',
                'Listing approved — 10 Sep 2026',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span aria-hidden className="font-sans text-[14px] font-extrabold text-teal">
                    ✓
                  </span>
                  <span className="font-sans text-[14px] font-medium text-white">{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-white/10 pt-4 font-mono text-[11px] tracking-[0.04em] text-[#9FB2C5]">
              INSPECTION ID&nbsp;&nbsp;AF-2026-008421&nbsp;&nbsp;•&nbsp;&nbsp;FIG.01
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
