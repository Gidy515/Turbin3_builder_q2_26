use anchor_lang::prelude::*;

#[account(discriminator = 1)] // 1 -255
#[derive(InitSpace)]
pub struct Escrow {
    pub maker: Pubkey,
    pub seed: u64, // To ensure uniqueness of the escrow account for a given maker  
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
    pub receive: u64, // Amount of mint_b the maker expects to receive from the taker
    pub bump: u8,
}

