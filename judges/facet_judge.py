# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# FacetJudge: one specialist judge in the Tribunal panel.
#
# The same code is deployed once per facet (solvency, authenticity, custodian,
# valuation). Each deployment is a distinct specialist: it carries its own
# `facet_name` and `rubric`, runs its own GenLayer consensus on its own
# sub-question, and renders a verdict the Casper Tribunal contract later
# federates. The verdict shape is uniform across facets:
#     {"vote": "PASS" | "FAIL" | "UNCERTAIN", "confidence": 0..10000 (bps), "reason": str}

import json

from genlayer import *

# Error classes so validators know how to compare failure paths (see skill).
ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"

VALID_VOTES = ("PASS", "FAIL", "UNCERTAIN")
# leader and validator must land within this confidence band (bps) to agree
CONFIDENCE_TOLERANCE_BPS = 2000


def _parse_confidence(raw) -> int:
    """Normalize a model confidence into basis points (0..10000).

    The prompt asks for an integer 0..100, but models drift, so accept a
    fraction (<=1 -> x10000), a percent (<=100 -> x100), or already-bps.
    """
    if raw is None:
        return 5000
    try:
        val = float(str(raw).strip().rstrip("%"))
    except (ValueError, TypeError):
        raise gl.vm.UserError(f"{ERROR_LLM} non-numeric confidence: {raw}")
    if val <= 1.0:
        bps = val * 10000.0
    elif val <= 100.0:
        bps = val * 100.0
    else:
        bps = val
    return max(0, min(10000, int(round(bps))))


def _normalize_verdict(analysis) -> dict:
    """Coerce a raw LLM response into the uniform verdict shape."""
    if not isinstance(analysis, dict):
        raise gl.vm.UserError(f"{ERROR_LLM} non-dict response: {type(analysis)}")

    raw_vote = analysis.get("vote")
    if raw_vote is None:
        for alt in ("verdict", "decision", "result", "answer"):
            if alt in analysis:
                raw_vote = analysis[alt]
                break
    vote = str(raw_vote).strip().upper() if raw_vote is not None else ""
    # map common synonyms onto the three canonical votes
    if vote in ("YES", "TRUE", "BACKED", "VALID", "AUTHENTIC"):
        vote = "PASS"
    elif vote in ("NO", "FALSE", "UNBACKED", "INVALID", "FAKE"):
        vote = "FAIL"
    elif vote in ("UNSURE", "UNKNOWN", "INCONCLUSIVE", "ABSTAIN"):
        vote = "UNCERTAIN"
    if vote not in VALID_VOTES:
        raise gl.vm.UserError(f"{ERROR_LLM} bad vote {raw_vote!r}; keys: {list(analysis.keys())}")

    confidence = _parse_confidence(analysis.get("confidence"))
    reason = str(analysis.get("reason", ""))[:500]
    return {"vote": vote, "confidence": confidence, "reason": reason}


def _handle_leader_error(leaders_res, leader_fn) -> bool:
    """Canonical validator-side comparison when the leader errored."""
    leader_msg = leaders_res.message if hasattr(leaders_res, "message") else ""
    try:
        leader_fn()
        return False  # leader errored, validator succeeded -> disagree
    except gl.vm.UserError as e:
        validator_msg = e.message if hasattr(e, "message") else str(e)
        if validator_msg.startswith(ERROR_EXPECTED) or validator_msg.startswith(ERROR_EXTERNAL):
            return validator_msg == leader_msg
        if validator_msg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(ERROR_TRANSIENT):
            return True
        return False
    except Exception:
        return False


def _build_prompt(facet_name: str, rubric: str, evidence: str) -> str:
    return f"""You are a specialist verification judge on a panel. You assess ONLY one
facet of a real-world-asset claim and nothing else.

Facet: {facet_name}
Your rubric (the only question you answer):
{rubric}

Evidence provided for this claim:
{evidence}

Decide PASS (the facet holds), FAIL (it does not), or UNCERTAIN (the evidence is
insufficient to decide). Do not stray outside your facet. Base the decision only
on the evidence above.

Respond with strict JSON and nothing else:
{{"vote": "PASS|FAIL|UNCERTAIN", "confidence": <integer 0-100>, "reason": "<one or two sentences>"}}"""


class FacetJudge(gl.Contract):
    facet_name: str
    rubric: str
    owner: Address
    # claim_id -> JSON verdict string
    verdicts: TreeMap[str, str]

    def __init__(self, facet_name: str, rubric: str):
        self.facet_name = facet_name
        self.rubric = rubric
        self.owner = gl.message.sender_account

    @gl.public.view
    def get_facet(self) -> dict:
        return {"facet_name": self.facet_name, "rubric": self.rubric}

    @gl.public.view
    def get_verdict(self, claim_id: str) -> str:
        if claim_id not in self.verdicts:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} no verdict for claim {claim_id}")
        return self.verdicts[claim_id]

    @gl.public.write
    def judge(self, claim_id: str, evidence: str) -> None:
        """Render this facet's verdict on a claim via GenLayer consensus and store it."""
        facet_name = self.facet_name
        rubric = self.rubric

        def leader_fn():
            prompt = _build_prompt(facet_name, rubric, evidence)
            analysis = gl.nondet.exec_prompt(prompt, response_format="json")
            return _normalize_verdict(analysis)

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            theirs = leaders_res.calldata
            # the vote must match exactly across validators
            if mine["vote"] != theirs.get("vote"):
                return False
            # confidence only needs to be close
            if abs(int(mine["confidence"]) - int(theirs.get("confidence", 0))) > CONFIDENCE_TOLERANCE_BPS:
                return False
            return True

        verdict = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        self.verdicts[claim_id] = json.dumps(verdict)
