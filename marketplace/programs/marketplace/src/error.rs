use anchor_lang::prelude::*;

#[error_code]
pub enum MarketplaceError {
    #[msg("Marketplace name cannot be empty")]
    InvalidName,

    #[msg("Marketplace name is too long")]
    NameTooLong,

    #[msg("Invalid marketplace fee")]
    InvalidFee,
}