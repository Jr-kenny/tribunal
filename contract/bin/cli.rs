//! odra-cli entrypoint for the Tribunal contract: deploy + configure the panel,
//! and a `demo` scenario that runs one claim end to end on-chain.

use tribunal::tribunal::Tribunal;
use tribunal::types::Vote;
use odra::host::{HostEnv, NoArgs};
use odra::schema::casper_contract_schema::NamedCLType;
use odra_cli::{
    deploy::DeployScript,
    scenario::{Args, Error, Scenario, ScenarioMetadata},
    CommandArg, ContractProvider, DeployedContractsContainer, DeployerExt, OdraCli,
};

// facet ids must match the rubrics in judges/rubrics.py
const AUTHENTICITY: u8 = 1;
const SOLVENCY: u8 = 2;
const CUSTODIAN: u8 = 3;
const VALUATION: u8 = 4;

/// Deploys Tribunal, configures the four proof-of-reserves facets, and registers
/// the deployer as the solvency judge so the qualifying demo can submit a verdict.
pub struct TribunalDeployScript;

impl DeployScript for TribunalDeployScript {
    fn deploy(
        &self,
        env: &HostEnv,
        container: &mut DeployedContractsContainer,
    ) -> Result<(), odra_cli::deploy::Error> {
        let mut tribunal = Tribunal::load_or_deploy(
            &env,
            NoArgs,
            container,
            700_000_000_000, // ~700 CSPR install ceiling; Tribunal wasm is larger than flipper
        )?;

        env.set_gas(6_000_000_000);
        tribunal.configure_facet(AUTHENTICITY, 1, false);
        env.set_gas(6_000_000_000);
        tribunal.configure_facet(SOLVENCY, 1, true);
        env.set_gas(6_000_000_000);
        tribunal.configure_facet(CUSTODIAN, 1, false);
        env.set_gas(6_000_000_000);
        tribunal.configure_facet(VALUATION, 1, false);

        // register the deployer itself as the solvency judge for the first demo
        env.set_gas(6_000_000_000);
        let judge = env.get_account(0);
        tribunal.register_judge(judge);

        Ok(())
    }
}

/// Runs one claim end to end: open -> submit a solvency verdict -> finalize.
/// These are the transaction-producing on-chain calls the qualification needs.
pub struct DemoScenario;

impl Scenario for DemoScenario {
    fn args(&self) -> Vec<CommandArg> {
        vec![
            CommandArg::new("vote", "Solvency vote: PASS | FAIL | UNCERTAIN", NamedCLType::String),
            CommandArg::new("confidence", "Confidence in basis points (0-10000)", NamedCLType::U64),
        ]
    }

    fn run(
        &self,
        env: &HostEnv,
        container: &DeployedContractsContainer,
        args: Args,
    ) -> Result<(), Error> {
        let mut tribunal = container.contract_ref::<Tribunal>(env)?;

        let vote_s = args.get_single::<String>("vote")?;
        let confidence = args.get_single::<u64>("confidence")? as u32;
        let vote = match vote_s.to_uppercase().as_str() {
            "PASS" => Vote::Pass,
            "FAIL" => Vote::Fail,
            _ => Vote::Uncertain,
        };

        env.set_gas(6_000_000_000);
        let claim = tribunal.try_open_claim()?;

        env.set_gas(6_000_000_000);
        tribunal.try_submit_verdict(claim, SOLVENCY, vote, confidence, "gl:demo-proof".to_string())?;

        env.set_gas(6_000_000_000);
        let status = tribunal.try_finalize(claim)?;

        println!("claim {claim} finalized on-chain with status: {status:?}");
        Ok(())
    }
}

impl ScenarioMetadata for DemoScenario {
    const NAME: &'static str = "demo";
    const DESCRIPTION: &'static str =
        "Open a claim, submit a solvency verdict, and finalize it on-chain";
}

pub fn main() {
    OdraCli::new()
        .about("CLI tool for the Tribunal contract")
        .deploy(TribunalDeployScript)
        .contract::<Tribunal>()
        .scenario(DemoScenario)
        .build()
        .run();
}
