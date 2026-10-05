import type { CalcReport, CalcRow } from '../../domain/calcReport';
import { Panel } from '../common/Panel';
import styles from './CalcSummary.module.css';

const SECTIONS: ReadonlyArray<{ key: keyof CalcReport; title: string; open: boolean }> = [
  { key: 'width', title: 'Width', open: false },
  { key: 'height', title: 'Height', open: false },
  { key: 'selection', title: 'Tray selection', open: true },
];

/** The calculation working; the same rows appear in the PDF and Excel reports. */
export function CalcSummary({ report }: { report: CalcReport }) {
  if (!report.width.length) return null;
  return (
    <Panel title="Calculation summary" meta="same rows as the PDF and Excel">
      <div className={styles.sections}>
        {SECTIONS.map(({ key, title, open }) => {
          const rows = report[key];
          const total = rows.findLast((r) => r.emphasis === 'total');
          return (
            <details key={key} className={styles.section} open={open}>
              <summary className={styles.summary}>
                <span>{title}</span>
                <span className={styles.total}>{total ? shortTotal(total) : ''}</span>
              </summary>
              <table className={styles.table}>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} data-total={row.emphasis === 'total' ? 'true' : undefined}>
                      <th scope="row">{row.label}</th>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          );
        })}
      </div>
    </Panel>
  );
}

/** The part after the last "=", e.g. "889.1 mm", for the collapsed heading. */
function shortTotal(row: CalcRow): string {
  const afterEquals = row.value.split(' = ').at(-1)!;
  return afterEquals.length < row.value.length ? afterEquals : row.value;
}
