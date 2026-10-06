import type { Tray } from '../../state/projectModel';
import { useProjectStore } from '../../state/projectStore';
import type { TrayOutcome } from '../../state/trayResult';
import { SectionView } from '../drawing/SectionView';
import { CalcSummary } from '../results/CalcSummary';
import { DesignSummary, RecommendedTray } from '../results/Recommendation';
import { LiveCalculation } from '../results/ResultSummary';
import styles from './ResultPane.module.css';

export function ResultPane({ tray, outcome }: { tray: Tray; outcome: TrayOutcome }) {
  const standards = useProjectStore((s) => s.project.standards);
  return (
    <>
      <LiveCalculation tray={tray} outcome={outcome} />
      <div className={styles.pairWrap}>
        <div className={styles.pair}>
          <RecommendedTray outcome={outcome} standards={standards} />
          <DesignSummary tray={tray} outcome={outcome} />
        </div>
      </div>
      <SectionView outcome={outcome} trayName={tray.name} />
      <CalcSummary report={outcome.report} />
    </>
  );
}
