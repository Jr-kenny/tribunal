# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# Scout: the discovery agent behind the registry's feeder.
#
# Where the FacetJudge reads the open web to *judge* a claim, the Scout reads the
# open web to *find* claims. It fetches a live real-world-asset source (a carbon
# registry feed, a proof-of-reserves / stablecoin feed, a Casper token listing)
# under GenLayer consensus, and the validators agree on the set of asset-backing
# claims it discovered. The off-chain feeder then files each new discovery onto
# the Casper registry, where the panel judges it. Nothing here is hardcoded: the
# claims come from whatever the source actually serves at scan time.
#
# A discovery is uniform regardless of source:
#     {"id": <verbatim id from the source>, "asset": str, "evidence": <json str>, "source": str}
# `id` is taken VERBATIM from the source data (a symbol, a registry id), never
# paraphrased, so leader and validator agree on the same identifiers even though
# the LLM's framing prose may differ between them.

import json

from genlayer import *

ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"

# never frame more than this many claims from a single scan
MAX_ITEMS_CAP = 25


def _clean_json(text) -> dict:
    """Coerce an LLM response into a dict, tolerating prose-wrapped JSON."""
    if isinstance(text, dict):
        return text
    s = str(text)
    first = s.find("{")
    last = s.rfind("}")
    if first == -1 or last == -1:
        raise gl.vm.UserError(f"{ERROR_LLM} no JSON object in response")
    return json.loads(s[first : last + 1])


def _normalize_discoveries(analysis, source: str, max_items: int) -> list:
    """Coerce a raw LLM response into a list of uniform discovery records.

    Only the `id` field needs to be stable across validators (it's taken from
    the source data), so consensus compares the set of ids, not the prose.
    """
    if not isinstance(analysis, dict):
        raise gl.vm.UserError(f"{ERROR_LLM} non-dict response: {type(analysis)}")
    raw = analysis.get("claims")
    if raw is None:
        for alt in ("items", "results", "discoveries", "assets"):
            if alt in analysis:
                raw = analysis[alt]
                break
    if not isinstance(raw, list):
        raise gl.vm.UserError(f"{ERROR_LLM} 'claims' is not a list; keys: {list(analysis.keys())}")

    out = []
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        ident = str(item.get("id", "")).strip()
        asset = str(item.get("asset", "")).strip()
        if not ident or not asset or ident in seen:
            continue
        seen.add(ident)
        evidence = item.get("evidence")
        # evidence is the framed claim the judges will assess; keep it as a json string
        if isinstance(evidence, (dict, list)):
            evidence_str = json.dumps(evidence)
        else:
            evidence_str = json.dumps({"asset": asset, "summary": str(evidence)[:600]})
        out.append({"id": ident, "asset": asset[:200], "evidence": evidence_str, "source": source})
        if len(out) >= min(max_items, MAX_ITEMS_CAP):
            break
    if not out:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} no claim-like items found at source")
    return out


def _scan_source(source_url: str, source_kind: str, max_items: int) -> list:
    """Fetch a live RWA source under consensus and frame the asset-backing claims
    it serves. Validators agree on the SET of source-derived ids, so the discovery
    is trust-minimized: a single node can't invent claims the others don't see."""

    prompt_head = (
        "You are a discovery agent for a real-world-asset (RWA) verification registry. "
        "Below is raw data fetched live from a public RWA source of kind '" + source_kind + "'. "
        "Find the entries that assert a real-world asset is backed/collateralized/retired "
        "(e.g. a stablecoin's circulating supply vs reserves, a tokenized asset's backing, "
        "a carbon-credit retirement). For each, produce a claim to be verified.\n\n"
        "Rules:\n"
        "- Take `id` VERBATIM from the source data (its symbol, ticker, or registry id). Do not invent or paraphrase it.\n"
        "- `asset` is a short human name.\n"
        "- `evidence` is an object with the concrete facts from the source (amounts, issuer, dates, the claim being made).\n"
        "- Only include real entries present in the data. Never fabricate.\n"
    )

    def leader_fn():
        res = gl.nondet.web.get(source_url)
        status = int(getattr(res, "status", 200) or 200)
        if status >= 500:
            raise gl.vm.UserError(f"{ERROR_TRANSIENT} source {status}")
        if status >= 400:
            raise gl.vm.UserError(f"{ERROR_EXTERNAL} source {status}")
        body = res.body.decode("utf-8", errors="replace")[:20000]
        prompt = (
            prompt_head
            + "\nSource data:\n" + body
            + '\n\nRespond with strict JSON and nothing else: '
            + '{"claims": [{"id": "...", "asset": "...", "evidence": {...}}]}'
        )
        analysis = _clean_json(gl.nondet.exec_prompt(prompt, response_format="json"))
        return {"claims": _normalize_discoveries(analysis, source_url, max_items)}

    def validator_fn(leaders_res: gl.vm.Result) -> bool:
        if not isinstance(leaders_res, gl.vm.Return):
            # leader errored: agree only on matching deterministic/transient errors
            leader_msg = leaders_res.message if hasattr(leaders_res, "message") else ""
            try:
                leader_fn()
                return False
            except gl.vm.UserError as e:
                vmsg = e.message if hasattr(e, "message") else str(e)
                if vmsg.startswith(ERROR_EXPECTED) or vmsg.startswith(ERROR_EXTERNAL):
                    return vmsg == leader_msg
                if vmsg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(ERROR_TRANSIENT):
                    return True
                return False
            except Exception:
                return False
        mine = leader_fn()["claims"]
        theirs = leaders_res.calldata.get("claims", [])
        # agree on the SET of discovered ids (the stable, source-derived field)
        my_ids = sorted(str(c.get("id", "")).lower() for c in mine)
        their_ids = sorted(str(c.get("id", "")).lower() for c in theirs)
        return my_ids == their_ids

    return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)["claims"]


class Scout(gl.Contract):
    owner: Address
    # discovery key ("<source_kind>:<id>") -> JSON {asset, evidence, source}
    discoveries: TreeMap[str, str]
    # insertion order of keys, so the feeder can page through them
    keys: DynArray[str]

    def __init__(self):
        self.owner = gl.message.sender_address

    @gl.public.write
    def scan(self, source_url: str, source_kind: str, max_items: int) -> None:
        """Scan a live RWA source under consensus and store any newly discovered
        asset-backing claims. Re-scanning the same source only adds new ids."""
        found = _scan_source(source_url, source_kind, int(max_items))
        for c in found:
            key = source_kind + ":" + c["id"]
            if key in self.discoveries:
                continue  # already discovered; the feeder may already have filed it
            self.discoveries[key] = json.dumps(
                {"asset": c["asset"], "evidence": c["evidence"], "source": c["source"]}
            )
            self.keys.append(key)

    @gl.public.view
    def count(self) -> int:
        return len(self.keys)

    @gl.public.view
    def get_discovery(self, key: str) -> str:
        if key not in self.discoveries:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} no discovery for key {key}")
        return self.discoveries[key]

    @gl.public.view
    def list_discoveries(self) -> str:
        """All discoveries as a JSON list of {key, asset, evidence, source}, for
        the feeder to file the new ones onto the Casper registry."""
        out = []
        for key in self.keys:
            rec = json.loads(self.discoveries[key])
            out.append({"key": key, "asset": rec["asset"], "evidence": rec["evidence"], "source": rec["source"]})
        return json.dumps(out)
