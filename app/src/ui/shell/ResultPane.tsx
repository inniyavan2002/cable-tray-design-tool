import type { Tray } from '../../state/projectModel';
import type { TrayOutcome } from '../../state/trayResult';
import { SectionView } from '../drawing/SectionView';
import { CalcSummary } from '../results/CalcSummary';
import { FillMeter, ResultBanner } from '../results/ResultSummary';

export function ResultPane({ tray, outcome }: { tray: Tray; outcome: TrayOutcome }) {
  return (
    <>
      <ResultBanner tray={tray} outcome={outcome} />
      <FillMeter outcome={outcome} />
      <SectionView outcome={outcome} />
      <CalcSummary report={outcome.report} />
    </>
  );
}
