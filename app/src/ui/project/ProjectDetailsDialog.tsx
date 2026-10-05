import { useId } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { TextField } from '../common/controls';
import controls from '../common/controls.module.css';
import { Dialog } from '../common/Dialog';
import styles from './ProjectDetailsDialog.module.css';

/** Project name and the details printed in the report title block. */
export function ProjectDetailsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const name = useProjectStore((s) => s.project.name);
  const details = useProjectStore((s) => s.project.details);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const setDetails = useProjectStore((s) => s.setProjectDetails);
  const dateId = useId();

  return (
    <Dialog
      open={open}
      title="Project details"
      onClose={onClose}
      footer={
        <button type="button" className={styles.done} onClick={onClose}>
          Done
        </button>
      }
    >
      <p className={styles.intro}>These appear in the title block of PDF and Excel reports. Changes are saved as you type.</p>
      <div className={styles.grid}>
        <div className={styles.wide}>
          <TextField label="Project name" value={name} onChange={setProjectName} />
        </div>
        <TextField label="Project number" value={details.number} onChange={(number) => setDetails({ number })} />
        <TextField label="Client" value={details.client} onChange={(client) => setDetails({ client })} />
        <TextField label="Prepared by" value={details.preparedBy} onChange={(preparedBy) => setDetails({ preparedBy })} />
        <TextField label="Checked by" value={details.checkedBy} onChange={(checkedBy) => setDetails({ checkedBy })} />
        <TextField label="Revision" value={details.revision} maxLength={12} onChange={(revision) => setDetails({ revision })} />
        <div className={controls.field}>
          <label htmlFor={dateId} className={controls.label}>
            Date
          </label>
          <input
            id={dateId}
            type="date"
            className={controls.input}
            value={details.date}
            onChange={(e) => {
              if (e.target.value) setDetails({ date: e.target.value });
            }}
          />
        </div>
      </div>
    </Dialog>
  );
}
