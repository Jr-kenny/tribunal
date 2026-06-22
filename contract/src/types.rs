use odra::prelude::*;

/// Confidence and reputation are stored as basis points (0..=10000) so the
/// contract stays integer-only on-chain. 10000 bps = 1.00.
pub type Bps = u32;

/// A single judge's call on its facet.
#[odra::odra_type]
pub enum Vote {
    Pass,
    Fail,
    Uncertain,
}

/// The federated outcome of a claim.
#[odra::odra_type]
pub enum ClaimStatus {
    Open,
    Backed,
    Disputed,
    NotBacked,
}

/// Per-facet configuration set by the admin.
#[odra::odra_type]
pub struct FacetConfig {
    pub facet_id: u8,
    /// relative weight in the non-critical aggregation
    pub weight: u32,
    /// a critical facet can veto the whole claim on a FAIL
    pub critical: bool,
}

/// Registry metadata for a claim: what asset it's about and where its evidence
/// lives (a URL plus the SHA-256 the evidence must hash to). Set when a claim is
/// opened with evidence, so the claim is a self-describing registry record.
#[odra::odra_type]
pub struct ClaimMeta {
    pub asset: String,
    pub evidence_uri: String,
    pub evidence_hash: String,
}

/// A verdict a judge submitted on-chain for one facet of one claim.
#[odra::odra_type]
pub struct SubmittedVerdict {
    pub facet_id: u8,
    pub judge: Address,
    pub vote: Vote,
    pub confidence: Bps,
    /// the GenLayer tx hash that produced this verdict, carried as evidence
    pub genlayer_proof: String,
}
