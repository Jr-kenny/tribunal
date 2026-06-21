use crate::types::*;

/// One judge's input to the federation, with the judge's current reputation
/// folded in so this function stays pure (no storage, no env).
pub struct FacetInput {
    pub config: FacetConfig,
    pub vote: Vote,
    pub confidence: Bps,
    pub reputation: Bps,
}

/// The federated result: a status band plus the aggregate confidence score.
pub struct Federated {
    pub status: ClaimStatus,
    pub score: Bps,
}

/// Federate per-facet verdicts into one outcome.
///
/// Pass 1: any critical facet that FAILs with reputation-weighted confidence at
/// or above `veto_threshold` sinks the whole claim to NotBacked.
/// Pass 2: otherwise, a reputation- and weight-weighted aggregate confidence is
/// mapped to BACKED / DISPUTED / NOT_BACKED via the band thresholds.
/// All thresholds are basis points.
pub fn federate(
    inputs: &[FacetInput],
    veto_threshold: Bps,
    backed_threshold: Bps,
    notbacked_threshold: Bps,
) -> Federated {
    // Pass 1: critical veto. Any critical FAIL whose reputation-weighted
    // confidence clears the veto threshold sinks the whole claim.
    for i in inputs {
        if i.config.critical && i.vote == Vote::Fail {
            let weighted = (i.confidence as u64 * i.reputation as u64 / 10_000) as Bps;
            if weighted >= veto_threshold {
                return Federated { status: ClaimStatus::NotBacked, score: 0 };
            }
        }
    }

    // Pass 2: reputation- and weight-weighted aggregate.
    // PASS = +confidence, FAIL = -confidence. UNCERTAIN abstains: it withholds
    // its vote entirely rather than dragging the score toward not-backed, since
    // "we don't know" is not the same as "it's false". The numerator can go
    // negative, so work in i128 then clamp the score to [0, 10000].
    let mut num: i128 = 0;
    let mut den: i128 = 0;
    for i in inputs {
        let signed_conf: i128 = match i.vote {
            Vote::Pass => i.confidence as i128,
            Vote::Fail => -(i.confidence as i128),
            Vote::Uncertain => continue,
        };
        let w = (i.config.weight as i128) * (i.reputation as i128);
        num += w * signed_conf;
        den += w;
    }
    // No judge took a position: no information, not a confident rejection.
    if den == 0 {
        return Federated { status: ClaimStatus::Disputed, score: 0 };
    }
    let score = (num / den).clamp(0, 10_000) as Bps;

    let status = if score >= backed_threshold {
        ClaimStatus::Backed
    } else if score <= notbacked_threshold {
        ClaimStatus::NotBacked
    } else {
        ClaimStatus::Disputed
    };
    Federated { status, score }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fc(id: u8, weight: u32, critical: bool) -> FacetConfig {
        FacetConfig { facet_id: id, weight, critical }
    }

    #[test]
    fn critical_fail_vetoes_even_when_majority_pass() {
        let inputs = vec![
            FacetInput { config: fc(1, 1, false), vote: Vote::Pass, confidence: 9200, reputation: 8000 },
            FacetInput { config: fc(2, 1, true),  vote: Vote::Fail, confidence: 8500, reputation: 9000 },
            FacetInput { config: fc(3, 1, false), vote: Vote::Pass, confidence: 7000, reputation: 6000 },
            FacetInput { config: fc(4, 1, false), vote: Vote::Pass, confidence: 8800, reputation: 7500 },
        ];
        // solvency weighted FAIL conf = 0.90 * 0.85 = 0.765 >= 0.60 veto threshold
        let out = federate(&inputs, 6000, 7000, 4000);
        assert_eq!(out.status, ClaimStatus::NotBacked);
    }

    #[test]
    fn all_pass_yields_backed() {
        let inputs = vec![
            FacetInput { config: fc(1, 1, false), vote: Vote::Pass, confidence: 9200, reputation: 8000 },
            FacetInput { config: fc(2, 1, true),  vote: Vote::Pass, confidence: 8500, reputation: 9000 },
            FacetInput { config: fc(3, 1, false), vote: Vote::Pass, confidence: 7000, reputation: 6000 },
            FacetInput { config: fc(4, 1, false), vote: Vote::Pass, confidence: 8800, reputation: 7500 },
        ];
        let out = federate(&inputs, 6000, 7000, 4000);
        assert_eq!(out.status, ClaimStatus::Backed);
        assert!(out.score >= 7000);
    }

    #[test]
    fn weak_critical_fail_below_threshold_does_not_veto() {
        // critical FAIL but low confidence and low reputation -> no veto
        let inputs = vec![
            FacetInput { config: fc(2, 1, true), vote: Vote::Fail, confidence: 3000, reputation: 2000 },
            FacetInput { config: fc(1, 1, false), vote: Vote::Pass, confidence: 9000, reputation: 9000 },
        ];
        let out = federate(&inputs, 6000, 7000, 4000);
        assert_ne!(out.status, ClaimStatus::NotBacked);
    }

    #[test]
    fn middling_score_is_disputed() {
        // facet2 abstains (Uncertain), so only the 5500-confidence PASS weighs
        // in: score 5500 lands between the not-backed (4000) and backed (7000)
        // bands -> Disputed.
        let inputs = vec![
            FacetInput { config: fc(1, 1, false), vote: Vote::Pass, confidence: 5500, reputation: 5000 },
            FacetInput { config: fc(2, 1, true),  vote: Vote::Uncertain, confidence: 5000, reputation: 5000 },
        ];
        let out = federate(&inputs, 6000, 7000, 4000);
        assert_eq!(out.status, ClaimStatus::Disputed);
    }

    #[test]
    fn all_abstain_is_disputed_not_backed() {
        // if every judge abstains, denominator is zero: score 0, but that should
        // read as "no information" -> Disputed, not a confident NotBacked.
        let inputs = vec![
            FacetInput { config: fc(1, 1, false), vote: Vote::Uncertain, confidence: 5000, reputation: 5000 },
            FacetInput { config: fc(2, 1, true),  vote: Vote::Uncertain, confidence: 5000, reputation: 5000 },
        ];
        let out = federate(&inputs, 6000, 7000, 4000);
        assert_eq!(out.status, ClaimStatus::Disputed);
    }
}
