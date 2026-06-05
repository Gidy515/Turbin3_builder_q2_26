#![allow(unexpected_cfgs, deprecated, ambiguous_glob_reexports)]

pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;
//pub use error::*;

declare_id!("E73iK9kjm4G99sFNc599JmS9uWPm5nmMXEkm9Ve2hyRL");

#[program]
pub mod nft_staking {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>, rewards_bps: u16, freeze_period: u16) -> Result<()> {
        initialize::handler(ctx, rewards_bps, freeze_period)
    }

    pub fn create_collection(ctx: Context<CreateCollection>, name: String, uri: String) -> Result<()> {
        create_collection::handler(ctx, name, uri)
    }

    pub fn mint_assets(ctx: Context<MintAsset>, name: String, uri: String) -> Result<()> {
        mint_asset::handler(ctx, name, uri)
    }

    pub fn stake(ctx: Context<Stake>) -> Result<()> {
        stake::handler(ctx)
    }

    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        unstake::handler(ctx)
    }
}

#[derive(Accounts)]
pub struct Init {}
