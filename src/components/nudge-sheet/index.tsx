import type { NudgeInfo } from '../../services/nudges';
import { formatDuration } from '../../utils/format';
import { Button } from '../ui/button';
import './nudge-sheet.css';

interface NudgeSheetProps {
  nudge: NudgeInfo;
  bucketColor: string;
  onEnd: () => void;
  onContinue: () => void;
}

export function NudgeSheet({ nudge, bucketColor, onEnd, onContinue }: NudgeSheetProps) {
  return (
    <div className="nudge-overlay" onClick={onContinue} role="dialog" aria-label="Aviso de tiempo">
      <div className="nudge-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="nudge-sheet__handle" />

        <h2 className="nudge-sheet__title">{nudge.message}</h2>
        <p className="nudge-sheet__detail">
          {nudge.type === 'over-average' && (
            <>
              Llevas <strong>{formatDuration(nudge.elapsedMs)}</strong>,
              tu promedio es <strong>{formatDuration(nudge.averageMs)}</strong>
            </>
          )}
          {nudge.type === 'work-cap' && (
            <>Te acercas al límite diario de 8 horas de trabajo.</>
          )}
          {nudge.type === 'under-average' && (
            <>
              Este bloque duró <strong>{formatDuration(nudge.elapsedMs)}</strong>,
              tu promedio es <strong>{formatDuration(nudge.averageMs)}</strong>
            </>
          )}
        </p>

        <div className="nudge-sheet__actions">
          <Button
            variant="primary"
            full
            size="lg"
            color={bucketColor}
            onClick={onEnd}
          >
            Sí, terminar
          </Button>
          <Button
            variant="ghost"
            full
            onClick={onContinue}
          >
            Sigo en esto
          </Button>
        </div>
      </div>
    </div>
  );
}
