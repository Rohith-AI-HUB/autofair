import { Container } from '@/components/shared/Container';

const ticks = ['10', '20', '30', '40', '50', '60', '70'];

export function Ruler() {
  return (
    <div aria-hidden className="border-b border-line bg-off-white">
      <Container className="flex items-center justify-between overflow-x-auto py-[10px]">
        <div className="flex w-full items-center justify-between gap-6 whitespace-nowrap">
          {ticks.map((t) => (
            <span key={t} className="font-mono text-[10px] text-[#999]">
              {t} —
            </span>
          ))}
          <span className="font-mono text-[10px] text-[#999]">80 ¦ 82 CHECKS —</span>
        </div>
      </Container>
    </div>
  );
}
