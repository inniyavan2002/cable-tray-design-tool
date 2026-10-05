import { useMemo } from 'react';
import { loadCatalog } from '../../data/catalog';
import type { Tray } from '../../state/projectModel';
import { resolveTrayCables } from '../../state/trayResult';
import { CableList } from '../cables/CableList';
import { TraySettingsCard } from '../settings/TraySettingsCard';

export function InputsPane({ tray }: { tray: Tray }) {
  // Resolved from the live tray (not the deferred result) so the list never lags behind edits.
  const resolved = useMemo(() => resolveTrayCables(tray, loadCatalog()), [tray]);
  return (
    <>
      <TraySettingsCard tray={tray} />
      <CableList tray={tray} resolved={resolved} />
    </>
  );
}
