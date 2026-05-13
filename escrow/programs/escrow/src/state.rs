use anchor_lang::prelude::*;

#[account(discriminator = 1)] // 1 -255
#[derive(InitSpace)]
pub struct Escrow {
    pub maker: Pubkey,
    pub seed: u64,
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
    pub receive: u64,
    pub bump: u8,
}