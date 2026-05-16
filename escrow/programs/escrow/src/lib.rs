pub mod error;
pub mod instructions;
pub mod state;
pub mod constants;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

declare_id!("7vYjvzFdmQFaRCKaKe6iMBU6VH772ftt8c8rntpepbPK");

#[program]
pub mod escrow {

use super::*;

    #[instruction(discriminator = 0)]
    pub fn make(ctx: Context<Make>, seed: u64, receive: u64, deposit: u64) -> Result<()> {
        ctx.accounts.init_escrow(seed, receive, &ctx.bumps)?;
        ctx.accounts.deposit(deposit)
    }

    #[instruction(discriminator = 1)]
    pub fn take(ctx: Context<Take>, _seed: u64) -> Result<()> {
        ctx.accounts.deposit()?;
        ctx.accounts.withdraw_and_close_vault()
    }

    #[instruction(discriminator = 2)]
    pub fn refund(ctx: Context<Refund>, _seed: u64) -> Result<()> {
        ctx.accounts.withdraw_and_close_vault()
    }
}
