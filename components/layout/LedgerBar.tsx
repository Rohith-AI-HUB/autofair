export function LedgerBar() {
  return (
    <div className="bg-navy">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-[9px] md:px-12">
        <p className="font-mono text-[10px] tracking-[0.04em] text-teal-bright">
          FIELD DOSSIER&nbsp;&nbsp;●&nbsp;&nbsp;SAMPLE DATA&nbsp;&nbsp;●&nbsp;&nbsp;BANGALORE /
          MUMBAI / DELHI
        </p>
        <p className="hidden font-mono text-[10px] tracking-[0.04em] text-[#D6E2EC] sm:block">
          AF-2026-008421&nbsp;&nbsp;•&nbsp;&nbsp;10 SEP 2026&nbsp;&nbsp;14:32 IST
        </p>
      </div>
    </div>
  );
}
