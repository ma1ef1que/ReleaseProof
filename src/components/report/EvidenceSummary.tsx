import type { EvidenceStatus } from "../../domain/report";
import { NO_KNOWN_BLOCKERS_DISCLAIMER } from "../../features/evidence/evidence-rules";

const EVIDENCE_STATUS_LABELS: Readonly<Record<EvidenceStatus, string>> = {
  evidence_incomplete: "Evidence incomplete",
  review_required: "Review required",
  no_known_blockers: "No known blockers in imported evidence",
};

interface EvidenceSummaryProps {
  status: EvidenceStatus;
  reasons: string[];
}

function EvidenceSummary({ status, reasons }: EvidenceSummaryProps) {
  return (
    <section
      className={`evidence-summary evidence-${status}`}
      aria-labelledby="evidence-status-title"
    >
      <h3 id="evidence-status-title" className="section-title">
        Evidence status
      </h3>
      <p className="evidence-status-label" aria-live="polite">
        {EVIDENCE_STATUS_LABELS[status]}
      </p>
      <details open>
        <summary>Why am I seeing this?</summary>
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>
      <p className="evidence-disclaimer">{NO_KNOWN_BLOCKERS_DISCLAIMER}</p>
    </section>
  );
}

export default EvidenceSummary;
