use crate::types::Bps;

/// Update a judge's reputation after a claim resolves.
///
/// `prior` is the judge's reputation in basis points. `correct` is whether its
/// facet call matched ground truth. On a correct call reputation steps up by
/// `step` (capped at 10000); on a wrong call it is slashed by `step` but never
/// below `floor`.
pub fn update_reputation(prior: Bps, correct: bool, step: Bps, floor: Bps) -> Bps {
    if correct {
        (prior + step).min(10_000)
    } else {
        prior.saturating_sub(step).max(floor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correct_call_increases_reputation() {
        assert_eq!(update_reputation(5000, true, 500, 1000), 5500);
    }

    #[test]
    fn wrong_call_decreases_reputation() {
        assert_eq!(update_reputation(5000, false, 500, 1000), 4500);
    }

    #[test]
    fn reputation_never_exceeds_max() {
        assert_eq!(update_reputation(9800, true, 500, 1000), 10000);
    }

    #[test]
    fn reputation_never_drops_below_floor() {
        assert_eq!(update_reputation(1200, false, 500, 1000), 1000);
    }

    #[test]
    fn slash_from_just_above_floor_clamps_to_floor() {
        // saturating_sub then max(floor): 1400 - 500 = 900, raised back to 1000
        assert_eq!(update_reputation(1400, false, 500, 1000), 1000);
    }
}
