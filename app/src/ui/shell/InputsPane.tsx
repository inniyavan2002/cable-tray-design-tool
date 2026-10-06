import { useMemo } from 'react';
import { loadCatalog } from '../../data/catalog';
import type { Tray } from '../../state/projectModel';
import { resolveTrayCables } from '../../state/trayResult';
import { CableList } from '../cables/CableList';
import { AllowancesCard, ArrangementCard, TrayCard } from '../settings/TraySettingsCard';
import { FirstRunGuide } from './FirstRunGuide';

/** The inputs in the order of the design steps: the tray, its cables, then how they are laid. */
export function InputsPane({ tray }: { tray: Tray }) {
  // Resolved from the live tray (not the deferred result) so the list never lags behind edits.
  const resolved = useMemo(() => resolveTrayCables(tray, loadCatalog()), [tray]);
  return (
    <>
      <FirstRunGuide tray={tray} />
      <TrayCard tray={tray} />
      <CableList tray={tray} resolved={resolved} />
      <ArrangementCard tray={tray} />
      <AllowancesCard tray={tray} />
    </>
  );
}
