import { useState } from 'preact/hooks';
import type { TimeEvent } from '../../db/schema';
import { BUCKETS, getBucket } from '../../utils/buckets';
import { formatDuration } from '../../utils/format';
import { Button } from '../ui/button';
import { reassignEvent, deleteEvent } from '../../services/events';
import './block-sheet.css';

interface BlockSheetProps {
  event: TimeEvent;
  onClose: () => void;
}

export function BlockSheet({ event, onClose }: BlockSheetProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bucket = getBucket(event.bucket);
  const durationMs = event.end - event.start;
  
  const startD = new Date(event.start);
  const endD = new Date(event.end);
  const rangeStr = `${startD.getHours().toString().padStart(2, '0')}:${startD.getMinutes().toString().padStart(2, '0')} - ${endD.getHours().toString().padStart(2, '0')}:${endD.getMinutes().toString().padStart(2, '0')}`;

  const handleReassign = async (newBucketId: string) => {
    if (event.id) {
      await reassignEvent(event.id, newBucketId as any);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (event.id) {
      await deleteEvent(event.id);
    }
    onClose();
  };

  return (
    <>
      <div className="block-sheet__backdrop" onClick={onClose} />
      <div className="block-sheet__panel" style={{ '--sheet-color': bucket.color } as Record<string, string>}>
        <div className="block-sheet__header">
          <span className="block-sheet__title">{bucket.icon} {bucket.label}</span>
          <span className="block-sheet__subtitle">{rangeStr} · {formatDuration(durationMs)}</span>
        </div>

        <div className="block-sheet__content">
          <span className="block-sheet__section-title">Reasignar bucket</span>
          <div className="block-sheet__chips">
            {BUCKETS.map(b => (
              <button 
                key={b.id}
                className={`block-sheet__chip ${b.id === bucket.id ? 'block-sheet__chip--active' : ''}`}
                style={{ '--chip-color': b.color } as Record<string, string>}
                onClick={() => handleReassign(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="block-sheet__actions">
          {confirmDelete ? (
            <div className="block-sheet__confirm">
              <span className="block-sheet__confirm-text">Esto deja un hueco en tu día. ¿Seguro?</span>
              <div className="block-sheet__confirm-btns">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                <Button variant="primary" color="var(--color-leak)" onClick={handleDelete}>Sí, eliminar</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" full onClick={handleDelete}>Eliminar bloque</Button>
          )}
        </div>
      </div>
    </>
  );
}
