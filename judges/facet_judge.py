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


def _read_casper_balance(node_url: str, public_key_hex: str) -> int:
    """Read a Casper account's main-purse balance straight off its RPC, under
    GenLayer consensus. This is the cross-chain read: GenLayer's own validators
    each fetch the balance and must agree (strict_eq) on the exact motes value,
    so the reserve figure is gathered trust-minimized rather than handed in."""

    def fetch() -> int:
        # body MUST be a JSON string for the GenVM web API, not bytes.
        payload = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "query_balance",
                "params": {"purse_identifier": {"main_purse_under_public_key": public_key_hex}},
            }
        )
        res = gl.nondet.web.post(node_url, body=payload, headers={"Content-Type": "application/json"})
        status = int(getattr(res, "status", 200) or 200)
        if status >= 500:
            raise gl.vm.UserError(f"{ERROR_TRANSIENT} Casper node {status}")
        if status >= 400:
            raise gl.vm.UserError(f"{ERROR_EXTERNAL} Casper node {status}")
        data = json.loads(res.body.decode("utf-8"))
        if "error" in data:
            raise gl.vm.UserError(f"{ERROR_EXTERNAL} Casper RPC error: {data['error']}")
        return int(data["result"]["balance"])

    return gl.eq_principle.strict_eq(fetch)


# USD prices are stored in micro-USD (value * 1_000_000) so sub-cent assets
# (CSPR trades below $0.01) keep their precision.
PRICE_SCALE = 1_000_000


def _read_market_price_micro(coingecko_id: str) -> int:
    """Read an asset's USD price (micro-USD) from a public market API under
    GenLayer consensus. Unlike the reserve balance, prices drift between fetches,
    so validators agree within a tolerance band rather than on an exact value.
    This is valuation's independent market price, gathered trust-minimized rather
    than taken from the issuer's paperwork."""

    url = "https://api.coingecko.com/api/v3/simple/price?ids=" + coingecko_id + "&vs_currencies=usd"

    def leader_fn():
        # gl.nondet.* must be called directly in the leader (the linter traces it
        # from the equivalence block; nesting it in a helper breaks that).
        res = gl.nondet.web.get(url)
        status = int(getattr(res, "status", 200) or 200)
        if status >= 500:
            raise gl.vm.UserError(f"{ERROR_TRANSIENT} price api {status}")
        if status >= 400:
            raise gl.vm.UserError(f"{ERROR_EXTERNAL} price api {status}")
        data = json.loads(res.body.decode("utf-8"))
        if coingecko_id not in data or "usd" not in data[coingecko_id]:
            raise gl.vm.UserError(f"{ERROR_EXTERNAL} price api: no usd price for {coingecko_id}")
        return {"micro": int(round(float(data[coingecko_id]["usd"]) * PRICE_SCALE))}

    def validator_fn(leaders_res: gl.vm.Result) -> bool:
        if not isinstance(leaders_res, gl.vm.Return):
            return _handle_leader_error(leaders_res, leader_fn)
        mine = leader_fn()["micro"]
        theirs = int(leaders_res.calldata.get("micro", 0))
        # both must agree on whether a price exists, then land within 5%
        if (mine == 0) != (theirs == 0):
            return False
        if mine > 0 and theirs > 0:
            ratio = mine / theirs
            if ratio > 1.05 or ratio < 0.95:
                return False
        return True

    result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
    return int(result["micro"])


def _read_entity_record(entity_name: str) -> dict:
    """Look the named custodian up in a public knowledge source (Wikipedia REST)
    under consensus. A real, recognizable entity resolves to an article; a
    fabricated one 404s. Validators agree on whether it was found and on the title,
    so this is custodian's independent existence check, not the issuer's say-so."""

    name = entity_name.strip().replace(" ", "_")
    url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + name

    def leader_fn():
        res = gl.nondet.web.get(url)
        status = int(getattr(res, "status", 200) or 200)
        if status == 404:
            return {"found": False, "title": "", "summary": ""}
        if status >= 500:
            raise gl.vm.UserError(f"{ERROR_TRANSIENT} wiki api {status}")
        if status >= 400:
            return {"found": False, "title": "", "summary": ""}
        data = json.loads(res.body.decode("utf-8"))
        return {"found": True, "title": str(data.get("title", "")), "summary": str(data.get("extract", ""))[:400]}

    def validator_fn(leaders_res: gl.vm.Result) -> bool:
        if not isinstance(leaders_res, gl.vm.Return):
            return _handle_leader_error(leaders_res, leader_fn)
        mine = leader_fn()
        theirs = leaders_res.calldata
        # agree on the stable facts: did it resolve, and to the same article
        return mine.get("found") == theirs.get("found") and mine.get("title") == theirs.get("title")

    return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)


def _verify_document(url: str, expected_sha256: str) -> dict:
    """Fetch the attestation document from its published URL and verify its
    SHA-256 against the digest in the claim, under consensus. This is
    authenticity's integrity check: the bytes are deterministic, so validators
    must agree on the exact hash (strict_eq). A tampered or swapped document fails."""

    def fetch_and_hash():
        res = gl.nondet.web.get(url)
        status = int(getattr(res, "status", 200) or 200)
        if status >= 500:
            raise gl.vm.UserError(f"{ERROR_TRANSIENT} document host {status}")
        if status >= 400:
            raise gl.vm.UserError(f"{ERROR_EXTERNAL} document host {status}")
        import hashlib

        actual = hashlib.sha256(res.body).hexdigest()
        return {"actual": actual, "match": actual.lower() == expected_sha256.strip().lower()}

    return gl.eq_principle.strict_eq(fetch_and_hash)


def _build_prompt(facet_name: str, rubric: str, evidence: str, verified_reserve_motes=None, verified_price_micro=None, verified_custodian=None, verified_attestation=None) -> str:
    verified_block = ""
    if verified_reserve_motes is not None:
        # 1 CSPR = 1_000_000_000 motes. Integer-only to stay deterministic.
        cspr = int(verified_reserve_motes) // 1_000_000_000
        verified_block += f"""

VERIFIED ON-CHAIN RESERVE (read live from the Casper chain by the validators
under consensus, not supplied by the issuer). This is ground truth for what the
reserve wallet actually holds. Trust THIS over any reserve figure stated in the
evidence above, even if the evidence claims a larger amount:
{verified_reserve_motes} motes ({cspr} CSPR)
"""
    if verified_price_micro is not None:
        whole = int(verified_price_micro) // 1_000_000
        frac = int(verified_price_micro) % 1_000_000
        verified_block += f"""

VERIFIED LIVE MARKET PRICE (read under GenLayer consensus from a public market
API, not supplied by the issuer). Use this as the independent market price when
judging whether the claimed value holds up:
${whole}.{frac:06d} USD per unit
"""
    if verified_custodian is not None:
        found = verified_custodian.get("found")
        title = verified_custodian.get("title", "")
        summary = verified_custodian.get("summary", "")
        if found:
            verified_block += f"""

VERIFIED EXTERNAL RECORD for the named custodian (looked up under GenLayer
consensus in a public knowledge source, not supplied by the issuer). The entity
resolves to a real public record:
title: {title}
summary: {summary}
"""
        else:
            verified_block += """

VERIFIED EXTERNAL RECORD for the named custodian (looked up under GenLayer
consensus): NO public record found for this entity. Treat an unfindable custodian
as a red flag for legitimacy.
"""
    if verified_attestation is not None:
        match = verified_attestation.get("match")
        actual = verified_attestation.get("actual", "")
        verified_block += f"""

VERIFIED DOCUMENT INTEGRITY (the attestation document was fetched from its
published URL and hashed under GenLayer consensus, not trusted from the issuer):
the document's actual SHA-256 {"MATCHES" if match else "DOES NOT MATCH"} the digest
in the claim. actual sha256: {actual}
Treat a mismatch as tampering or a swapped document.
"""
    return f"""You are a specialist verification judge on a panel. You assess ONLY one
facet of a real-world-asset claim and nothing else.

Facet: {facet_name}
Your rubric (the only question you answer):
{rubric}

Evidence provided for this claim:
{evidence}{verified_block}

Decide PASS (the facet holds), FAIL (it does not), or UNCERTAIN (the evidence is
insufficient to decide). Do not stray outside your facet. Base the decision on the
evidence above, and where any VERIFIED block is given (on-chain reserve, live
market price, external custodian record, or document integrity), treat it as
ground truth regardless of what the issuer's paperwork claims.

Respond with strict JSON and nothing else:
{{"vote": "PASS|FAIL|UNCERTAIN", "confidence": <integer 0-100>, "reason": "<one or two sentences>"}}"""


class FacetJudge(gl.Contract):
    facet_name: str
    rubric: str
    owner: Address
    # claim_id -> JSON verdict string
    verdicts: TreeMap[str, str]
    # claim_id -> reserve balance (motes, as string) read live from Casper
    reserves: TreeMap[str, str]
    # claim_id -> market price (micro-USD, as string) read live from a price API
    prices: TreeMap[str, str]
    # claim_id -> JSON custodian record looked up in a public knowledge source
    custodians: TreeMap[str, str]
    # claim_id -> JSON document-integrity result (fetched + hashed under consensus)
    attestations: TreeMap[str, str]

    def __init__(self, facet_name: str, rubric: str):
        self.facet_name = facet_name
        self.rubric = rubric
        self.owner = gl.message.sender_address

    @gl.public.view
    def get_reserve(self, claim_id: str) -> str:
        if claim_id not in self.reserves:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} no reserve read for claim {claim_id}")
        return self.reserves[claim_id]

    @gl.public.write
    def read_reserve(self, claim_id: str, node_url: str, reserve_public_key: str) -> None:
        """Read the reserve account's Casper balance under consensus and store it."""
        balance = _read_casper_balance(node_url, reserve_public_key)
        self.reserves[claim_id] = str(balance)

    @gl.public.view
    def get_price(self, claim_id: str) -> str:
        if claim_id not in self.prices:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} no price read for claim {claim_id}")
        return self.prices[claim_id]

    @gl.public.write
    def read_price(self, claim_id: str, coingecko_id: str) -> None:
        """Read the asset's live USD market price under consensus and store it (micro-USD)."""
        micro = _read_market_price_micro(coingecko_id)
        self.prices[claim_id] = str(micro)

    @gl.public.view
    def get_custodian(self, claim_id: str) -> str:
        if claim_id not in self.custodians:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} no custodian lookup for claim {claim_id}")
        return self.custodians[claim_id]

    @gl.public.write
    def read_custodian(self, claim_id: str, entity_name: str) -> None:
        """Look the custodian up in a public knowledge source under consensus and store it."""
        record = _read_entity_record(entity_name)
        self.custodians[claim_id] = json.dumps(record)

    @gl.public.view
    def get_attestation(self, claim_id: str) -> str:
        if claim_id not in self.attestations:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} no attestation check for claim {claim_id}")
        return self.attestations[claim_id]

    @gl.public.write
    def read_attestation(self, claim_id: str, url: str, expected_sha256: str) -> None:
        """Fetch the attestation document and verify its SHA-256 under consensus, then store it."""
        result = _verify_document(url, expected_sha256)
        self.attestations[claim_id] = json.dumps(result)

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
        # If the reserve was read live from Casper for this claim, hand that
        # verified balance to the judge as ground truth so the verdict is decided
        # against the chain, not against a self-reported number in the evidence.
        verified = self.reserves[claim_id] if claim_id in self.reserves else None
        price = self.prices[claim_id] if claim_id in self.prices else None
        custodian = json.loads(self.custodians[claim_id]) if claim_id in self.custodians else None
        attestation = json.loads(self.attestations[claim_id]) if claim_id in self.attestations else None

        def leader_fn():
            prompt = _build_prompt(facet_name, rubric, evidence, verified, price, custodian, attestation)
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
