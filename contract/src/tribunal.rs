use odra::prelude::*;
use crate::types::*;
use crate::federation::{federate, FacetInput};
use crate::reputation::update_reputation;

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
        self.veto_threshold.set(6000);
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
        out.status
    }

    /// Admin: resolve a claim against ground truth, scoring each judge on its
    /// own facet. `truth_pass_facets` lists the facet ids that were actually true.
    pub fn resolve_claim(&mut self, claim_id: u64, truth_pass_facets: Vec<u8>) {
        self.assert_admin();
        let step = self.rep_step.get_or_default();
        let floor = self.rep_floor.get_or_default();
        for fid in self.facet_ids.iter() {
            let key = vkey(claim_id, fid);
            if self.verdict_present.get(&key).unwrap_or(false) {
                let v = self.verdicts.get(&key).unwrap();
                let truth_pass = truth_pass_facets.contains(&fid);
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
