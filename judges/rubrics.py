# Rubrics for the proof-of-reserves panel. Each entry is deployed as its own
# FacetJudge instance (its own GenLayer identity + Casper key + reputation).
# facet_id must match the ids the Tribunal contract is configured with.

RUBRICS = {
    "solvency": {
        "facet_id": 2,
        "critical": True,
        "facet_name": "Solvency",
        "rubric": (
            "Do the reserves actually cover the stated liabilities? PASS only if the "
            "evidence shows reserve holdings at least equal to the stated liabilities, "
            "in the right asset, with no obvious double-counting or encumbrance. FAIL if "
            "reserves fall short, are in the wrong asset, or the on-chain balance does not "
            "back the claim. UNCERTAIN if the balance or liabilities cannot be determined "
            "from the evidence."
        ),
    },
    "authenticity": {
        "facet_id": 1,
        "critical": False,
        "facet_name": "Authenticity",
        "rubric": (
            "Is the issuer's attestation document genuine and current? PASS if it appears "
            "authentic, internally consistent, signed by the party it claims, and recent. "
            "FAIL if it shows signs of tampering, mismatched signatories, or is clearly "
            "stale. UNCERTAIN if authenticity cannot be assessed from the evidence."
        ),
    },
    "custodian": {
        "facet_id": 3,
        "critical": False,
        "facet_name": "Custodian",
        "rubric": (
            "Is the named custodian or attestor real and reputable? PASS if the custodian "
            "is a recognizable, legitimate entity with no obvious red flags. FAIL if the "
            "custodian is unknown, flagged, sanctioned, or shows signs of being fabricated. "
            "UNCERTAIN if the custodian cannot be evaluated from the evidence."
        ),
    },
    "valuation": {
        "facet_id": 4,
        "critical": False,
        "facet_name": "Valuation",
        "rubric": (
            "Does the claimed asset value hold up against independent market pricing? PASS "
            "if the stated value is consistent with the asset's fair market value. FAIL if "
            "the claimed value is materially inflated or unsupported by market evidence. "
            "UNCERTAIN if no independent pricing is available in the evidence."
        ),
    },
}
