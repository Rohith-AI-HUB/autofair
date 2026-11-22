import { Container } from '@/components/shared/Container';
import { PROTOCOL, verifiedInspection } from '@/lib/data/inspections';

/** Decorative ticker — the labels are the real checklist, not a made-up scale. */
export function Ruler() {
  return (
    <div aria-hidden className="border-b border-line bg-off-white">
      <Container className="flex items-center justify-between overflow-x-auto py-[10px]">
        <div className="flex w-full items-center justify-between gap-6 whitespace-nowrap">
          {verifiedInspection.map((c) => (
            <span key={c.id} className="font-mono text-[10px] text-[#999]">
              {c.title} — {c.total}
            </span>
          ))}
          <span className="font-mono text-[10px] text-[#999]">
            {PROTOCOL.total} CHECKS IN {PROTOCOL.sections} SECTIONS —
          </span>
        </div>
      </Container>
    </div>
  );
}
