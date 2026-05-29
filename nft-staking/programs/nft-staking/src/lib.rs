use anchor_lang::prelude::*;

declare_id!("E73iK9kjm4G99sFNc599JmS9uWPm5nmMXEkm9Ve2hyRL");

#[program]
pub mod nft_staking {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
