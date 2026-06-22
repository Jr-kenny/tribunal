use odra::prelude::*;
use crate::types::*;
use crate::federation::{federate, FacetInput};
use crate::reputation::update_reputation;

/// Emitted when a claim is opened with evidence. The registry and the autonomous
/// watcher read these off the event log instead of decoding contract storage.
#[odra::event]
pub struct ClaimOpened {
    pub claim_id: u64,
    pub asset: String,
    pub evidence_uri: String,
    pub evidence_hash: String,
    pub submitter: Address,
}

/// Emitted when a claim is federated into a final outcome.
#[odra::event]
pub struct ClaimFinalized {
    pub claim_id: u64,
    pub status: ClaimStatus,
    pub score: Bps,
}

/// Pack (claim_id, facet_id) into one u64 key so we avoid tuple-keyed mappings.
/// claim_id occupies the high 56 bits and facet_id the low 8, which is ample
/// since claim ids increment from zero.
fn vkey(claim_id: u64, facet_id: u8) -> u64 {
    (claim_id << 8) | (facet_id as u64)
}

#[odra::module]
pub struct Tribunal {
    admin: Var<Address>,
    // facet config keyed by facet_id, with the ids tracked in a list to iterate
    facets: Mapping<u8, FacetConfig>,
    facet_ids: List<u8>,
    // judge reputation (bps) and registration
    reputation: Mapping<Address, Bps>,
    registered: Mapping<Address, bool>,
    // claim bookkeeping
    next_claim_id: Var<u64>,
    claim_status: Mapping<u64, ClaimStatus>,
    claim_score: Mapping<u64, Bps>,
    // registry metadata for claims opened with evidence (asset + evidence pointer)
    claim_meta: Mapping<u64, ClaimMeta>,
    // (claim_id, facet_id) packed -> verdict
    verdicts: Mapping<u64, SubmittedVerdict>,
    verdict_present: Mapping<u64, bool>,
    // tunables (bps)
    veto_threshold: Var<Bps>,
    backed_threshold: Var<Bps>,
    notbacked_threshold: Var<Bps>,
    rep_step: Var<Bps>,
    rep_floor: Var<Bps>,
    starting_rep: Var<Bps>,
}

#[odra::module]
impl Tribunal {
    pub fn init(&mut self) {
        self.admin.set(self.env().caller());
        self.next_claim_id.set(0);
        // a median-reputation judge (starting 5000) can veto at ~0.80+ confidence
        self.veto_threshold.set(4000);
        self.backed_threshold.set(7000);
        self.notbacked_threshold.set(4000);
        self.rep_step.set(500);
        self.rep_floor.set(1000);
        self.starting_rep.set(5000);
    }

    /// Admin: define or update a facet.
    pub fn configure_facet(&mut self, facet_id: u8, weight: u32, critical: bool) {
        self.assert_admin();
        if self.facets.get(&facet_id).is_none() {
            self.facet_ids.push(facet_id);
        }
        self.facets.set(&facet_id, FacetConfig { facet_id, weight, critical });
    }

    /// Admin: register a judge and seed its starting reputation.
    pub fn register_judge(&mut self, judge: Address) {
        self.assert_admin();
        if !self.registered.get(&judge).unwrap_or(false) {
            self.registered.set(&judge, true);
            self.reputation.set(&judge, self.starting_rep.get_or_default());
        }
    }

    /// Open a new claim, returning its id.
    pub fn open_claim(&mut self) -> u64 {
        let id = self.next_claim_id.get_or_default();
        self.next_claim_id.set(id + 1);
        self.claim_status.set(&id, ClaimStatus::Open);
        id
    }

    /// Open a claim as a registry record: store the asset and the evidence pointer
    /// (a URL and the SHA-256 it must hash to) and emit a ClaimOpened event so the
    /// registry and the watcher can pick it up off the event log. Permissionless.
    pub fn open_claim_with_evidence(&mut self, asset: String, evidence_uri: String, evidence_hash: String) -> u64 {
        let id = self.next_claim_id.get_or_default();
        self.next_claim_id.set(id + 1);
        self.claim_status.set(&id, ClaimStatus::Open);
        self.claim_meta.set(&id, ClaimMeta {
            asset: asset.clone(),
            evidence_uri: evidence_uri.clone(),
            evidence_hash: evidence_hash.clone(),
        });
        self.env().emit_event(ClaimOpened {
            claim_id: id,
            asset,
            evidence_uri,
            evidence_hash,
            submitter: self.env().caller(),
        });
        id
    }

    /// A registered judge submits its verdict for one facet of a claim.
    pub fn submit_verdict(&mut self, claim_id: u64, facet_id: u8, vote: Vote, confidence: Bps, genlayer_proof: String) {
        let judge = self.env().caller();
        if !self.registered.get(&judge).unwrap_or(false) {
            self.env().revert(Error::NotRegistered);
        }
        let key = vkey(claim_id, facet_id);
        if self.verdict_present.get(&key).unwrap_or(false) {
            self.env().revert(Error::DuplicateVerdict);
        }
        self.verdicts.set(&key, SubmittedVerdict { facet_id, judge, vote, confidence, genlayer_proof });
        self.verdict_present.set(&key, true);
    }

    /// Federate all submitted verdicts for a claim into one on-chain outcome.
    pub fn finalize(&mut self, claim_id: u64) -> ClaimStatus {
        let mut inputs: Vec<FacetInput> = Vec::new();
        for fid in self.facet_ids.iter() {
            let key = vkey(claim_id, fid);
            if self.verdict_present.get(&key).unwrap_or(false) {
                let v = self.verdicts.get(&key).unwrap();
                let rep = self.reputation.get(&v.judge).unwrap_or(0);
                let cfg = self.facets.get(&fid).unwrap();
                inputs.push(FacetInput { config: cfg, vote: v.vote, confidence: v.confidence, reputation: rep });
            }
        }
        let out = federate(
            &inputs,
            self.veto_threshold.get_or_default(),
            self.backed_threshold.get_or_default(),
            self.notbacked_threshold.get_or_default(),
        );
        self.claim_status.set(&claim_id, out.status.clone());
        self.claim_score.set(&claim_id, out.score);
        self.env().emit_event(ClaimFinalized {
            claim_id,
            status: out.status.clone(),
            score: out.score,
        });
        out.status
    }

    /// Admin: resolve a claim against ground truth, scoring each judge on its
    /// own facet. `truth_pass_mask` is a bitmask where bit `facet_id` is set if
    /// that facet was actually true. (A Vec<u8> arg is rejected by casper-types,
    /// which wants the Bytes newtype, so a bitmask is used instead.)
    pub fn resolve_claim(&mut self, claim_id: u64, truth_pass_mask: u64) {
        self.assert_admin();
        let step = self.rep_step.get_or_default();
        let floor = self.rep_floor.get_or_default();
        for fid in self.facet_ids.iter() {
            let key = vkey(claim_id, fid);
            if self.verdict_present.get(&key).unwrap_or(false) {
                let v = self.verdicts.get(&key).unwrap();
                let truth_pass = (truth_pass_mask >> (fid as u64)) & 1 == 1;
                let judge_pass = v.vote == Vote::Pass;
                // Uncertain is neither a correct PASS nor a correct FAIL.
                let correct = match v.vote {
                    Vote::Uncertain => false,
                    _ => truth_pass == judge_pass,
                };
                let prior = self.reputation.get(&v.judge).unwrap_or(0);
                self.reputation.set(&v.judge, update_reputation(prior, correct, step, floor));
            }
        }
    }

    // --- views ---
    pub fn get_status(&self, claim_id: u64) -> ClaimStatus {
        self.claim_status.get(&claim_id).unwrap_or(ClaimStatus::Open)
    }
    pub fn get_score(&self, claim_id: u64) -> Bps {
        self.claim_score.get(&claim_id).unwrap_or(0)
    }
    pub fn get_reputation(&self, judge: Address) -> Bps {
        self.reputation.get(&judge).unwrap_or(0)
    }
    /// per-facet breakdown so a consumer can drill into a finalized verdict
    pub fn get_verdict(&self, claim_id: u64, facet_id: u8) -> Option<SubmittedVerdict> {
        self.verdicts.get(&vkey(claim_id, facet_id))
    }
    /// registry metadata for a claim opened with evidence (asset + evidence pointer)
    pub fn get_claim_meta(&self, claim_id: u64) -> Option<ClaimMeta> {
        self.claim_meta.get(&claim_id)
    }

    fn assert_admin(&self) {
        if self.env().caller() != self.admin.get().unwrap() {
            self.env().revert(Error::NotAdmin);
        }
    }
}

#[odra::odra_error]
pub enum Error {
    NotAdmin = 1,
    NotRegistered = 2,
    DuplicateVerdict = 3,
}

#[cfg(test)]
mod tests {
    use super::{Tribunal, ClaimOpened, ClaimFinalized};
    use crate::types::{Vote, ClaimStatus};
    use odra::host::{Deployer, NoArgs, HostRef};

    // facet ids used across the proof-of-reserves panel
    const AUTHENTICITY: u8 = 1;
    const SOLVENCY: u8 = 2;
    const CUSTODIAN: u8 = 3;
    const VALUATION: u8 = 4;

    #[test]
    fn solvency_fail_vetoes_full_claim() {
        let env = odra_test::env();
        let mut t = Tribunal::deploy(&env, NoArgs);

        // deployer (account 0) is admin
        let auth = env.get_account(1);
        let solv = env.get_account(2);
        let cust = env.get_account(3);
        let val = env.get_account(4);

        t.configure_facet(AUTHENTICITY, 1, false);
        t.configure_facet(SOLVENCY, 1, true);
        t.configure_facet(CUSTODIAN, 1, false);
        t.configure_facet(VALUATION, 1, false);
        for j in [auth, solv, cust, val] {
            t.register_judge(j);
        }

        let claim = t.open_claim();

        env.set_caller(auth);
        t.submit_verdict(claim, AUTHENTICITY, Vote::Pass, 9200, String::from("gl:0xauth"));
        env.set_caller(solv);
        t.submit_verdict(claim, SOLVENCY, Vote::Fail, 8500, String::from("gl:0xsolv"));
        env.set_caller(cust);
        t.submit_verdict(claim, CUSTODIAN, Vote::Pass, 7000, String::from("gl:0xcust"));
        env.set_caller(val);
        t.submit_verdict(claim, VALUATION, Vote::Pass, 8800, String::from("gl:0xval"));

        let status = t.finalize(claim);
        assert_eq!(status, ClaimStatus::NotBacked);
        assert_eq!(t.get_status(claim), ClaimStatus::NotBacked);
        // the per-facet breakdown is retained on-chain
        let v = t.get_verdict(claim, SOLVENCY).unwrap();
        assert_eq!(v.vote, Vote::Fail);
        assert_eq!(v.genlayer_proof, String::from("gl:0xsolv"));
    }

    #[test]
    fn resolution_rewards_correct_and_slashes_wrong_judges() {
        let env = odra_test::env();
        let mut t = Tribunal::deploy(&env, NoArgs);

        let auth = env.get_account(1);
        let solv = env.get_account(2);
        let cust = env.get_account(3);
        let val = env.get_account(4);

        t.configure_facet(AUTHENTICITY, 1, false);
        t.configure_facet(SOLVENCY, 1, true);
        t.configure_facet(CUSTODIAN, 1, false);
        t.configure_facet(VALUATION, 1, false);
        for j in [auth, solv, cust, val] {
            t.register_judge(j);
        }
        assert_eq!(t.get_reputation(solv), 5000); // starting reputation

        let claim = t.open_claim();
        env.set_caller(auth);
        t.submit_verdict(claim, AUTHENTICITY, Vote::Pass, 9000, String::from("gl:a"));
        env.set_caller(solv);
        t.submit_verdict(claim, SOLVENCY, Vote::Fail, 9000, String::from("gl:s"));
        env.set_caller(cust);
        t.submit_verdict(claim, CUSTODIAN, Vote::Fail, 9000, String::from("gl:c"));
        env.set_caller(val);
        t.submit_verdict(claim, VALUATION, Vote::Pass, 9000, String::from("gl:v"));

        // ground truth: facets 1, 3, 4 were actually true, solvency (2) really failed.
        // so solvency's FAIL is correct, but custodian's FAIL is wrong (3 was true).
        // mask with bits 1, 3, 4 set = 2 + 8 + 16 = 26.
        let truth_mask: u64 = (1 << AUTHENTICITY) | (1 << CUSTODIAN) | (1 << VALUATION);
        env.set_caller(env.get_account(0)); // admin
        t.resolve_claim(claim, truth_mask);

        assert_eq!(t.get_reputation(solv), 5500); // correct FAIL -> up
        assert_eq!(t.get_reputation(auth), 5500); // correct PASS -> up
        assert_eq!(t.get_reputation(val), 5500);  // correct PASS -> up
        assert_eq!(t.get_reputation(cust), 4500); // wrong FAIL -> slashed
    }

    #[test]
    fn open_with_evidence_records_and_emits() {
        let env = odra_test::env();
        let mut t = Tribunal::deploy(&env, NoArgs);

        let id = t.open_claim_with_evidence(
            String::from("Gold bar #7"),
            String::from("https://example.com/ev.json"),
            String::from("abc123"),
        );

        // stored as a self-describing registry record
        let meta = t.get_claim_meta(id).unwrap();
        assert_eq!(meta.asset, String::from("Gold bar #7"));
        assert_eq!(meta.evidence_uri, String::from("https://example.com/ev.json"));
        assert_eq!(meta.evidence_hash, String::from("abc123"));

        // and emitted on the event log for the registry/watcher to read
        let ev: ClaimOpened = t.get_event(0).unwrap();
        assert_eq!(ev.claim_id, id);
        assert_eq!(ev.asset, String::from("Gold bar #7"));
        assert_eq!(ev.evidence_uri, String::from("https://example.com/ev.json"));
    }

    #[test]
    fn finalize_emits_claim_finalized() {
        let env = odra_test::env();
        let mut t = Tribunal::deploy(&env, NoArgs);
        let solv = env.get_account(2);

        t.configure_facet(SOLVENCY, 1, true);
        t.register_judge(solv);

        let claim = t.open_claim_with_evidence(String::from("X"), String::from("u"), String::from("h")); // event 0
        env.set_caller(solv);
        t.submit_verdict(claim, SOLVENCY, Vote::Fail, 9000, String::from("gl"));
        env.set_caller(env.get_account(0));
        let status = t.finalize(claim); // event 1
        assert_eq!(status, ClaimStatus::NotBacked);

        let ev: ClaimFinalized = t.get_event(1).unwrap();
        assert_eq!(ev.claim_id, claim);
        assert_eq!(ev.status, ClaimStatus::NotBacked);
    }
}
