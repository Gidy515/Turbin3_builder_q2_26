# Escrow — Solana Anchor Program

A trustless, non-custodial token escrow program built with Anchor on Solana. Two parties can exchange different SPL tokens without needing to trust each other or rely on a third party. The program holds the maker's tokens in a secure vault until either the taker fulfils the trade or the maker cancels it.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Program Architecture](#program-architecture)
- [State](#state)
- [Account Constraints](#account-constraints)
- [Instructions](#instructions)
  - [Make](#make)
  - [Take](#take)
  - [Refund](#refund)
- [Token Program Compatibility](#token-program-compatibility)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Building](#building)
- [Testing with LiteSVM](#testing-with-litesvm)
- [Deployment](#deployment)

---

## How It Works

The escrow follows an offer-and-accept model. A maker opens an escrow by depositing tokens they own and declaring how many tokens they want back in return. A taker can then fulfil those terms and both parties receive what they agreed on atomically — either the full exchange happens or nothing does. If no taker steps in, the maker can cancel the escrow at any time and recover their tokens.

The program never holds SOL on behalf of users. It only holds SPL tokens inside a vault token account that it controls via a PDA. All rent for created accounts is paid by the relevant signer at the time of account creation.

---

## Program Architecture

The program manages two on-chain accounts per escrow:

**`escrow` PDA** — a data account seeded with the constant string `"escrow"`, the maker's public key, and a `u64` seed value supplied by the maker. The combination of maker key and numeric seed makes each escrow globally unique and allows the same wallet to open multiple concurrent escrows by varying the seed. The account stores all the terms of the trade and the bump seed needed for signing CPIs later.

**`vault` token account** — an Associated Token Account for `mint_a` whose authority is set to the `escrow` PDA itself. Because the vault's authority is a PDA rather than a wallet, only the program can authorise movements of tokens out of it. It does so by reconstructing the escrow's signer seeds at runtime using the bump stored in the escrow account, then passing them to the token program via `CpiContext::new_with_signer`.

The flow across the three instructions looks like this:

```
Make:    maker deposits mint_a → vault (held by escrow PDA)
Take:    taker sends mint_b → maker
         escrow PDA signs → vault releases mint_a → taker
         vault and escrow accounts closed, rent returned to maker
Refund:  escrow PDA signs → vault releases mint_a → maker
         vault and escrow accounts closed, rent returned to maker
```

---

## State

The `Escrow` account uses a custom Anchor discriminator of `1` (set via `#[account(discriminator = 1)]`), overriding Anchor's default SHA256-based discriminator. This is a deliberate optimisation available in Anchor 1.x that reduces compute overhead during account deserialisation and makes the discriminator byte predictable and human-readable.

The account derives `InitSpace` automatically, meaning Anchor computes the required byte allocation from the field types at compile time rather than requiring a hardcoded `space` value.

The fields stored are:

- **`maker: Pubkey`** — the wallet that opened the escrow. Used in PDA seed derivation and verified by `has_one` constraints during take and refund so that the correct maker account is always passed.
- **`seed: u64`** — chosen by the maker at creation. Included in the PDA seeds to allow multiple simultaneous escrows per wallet.
- **`mint_a: Pubkey`** — the mint of the token the maker is depositing and offering. Verified by `has_one` during take and refund.
- **`mint_b: Pubkey`** — the mint of the token the maker wants to receive. Verified by `has_one` during take.
- **`receive: u64`** — the exact lamport-equivalent amount of `mint_b` tokens the maker expects. The taker must send precisely this amount.
- **`bump: u8`** — the canonical bump seed for the escrow PDA. Stored at init time so the program can reconstruct signer seeds in later instructions without calling `find_program_address` again, saving compute units.

---

## Account Constraints

The program makes heavy use of Anchor's declarative account validation constraints, which are checked before any instruction logic runs.

**`init`** — used on the `escrow` account in `Make` and on the `vault` ATA in both `Make` and `Take` (where the vault is being freshly created). Anchor verifies the account does not already exist, creates it, and sets its owner to the program or token program respectively.

**`init_if_needed`** — used on `taker_ata_a` and `maker_ata_b` in `Take`. Because these ATAs may or may not exist at the time a taker calls the instruction, Anchor creates them if absent and skips creation if they are already initialised. The respective payers are `taker` and `maker`.

**`has_one`** — used on the `escrow` account in both `Take` and `Refund`. This constraint checks that the public key stored in the named escrow field matches the public key of the account passed in. For example, `has_one = mint_a` verifies that `escrow.mint_a == mint_a.key()`. This prevents a taker from substituting a different token mint to manipulate the exchange.

**`close = <destination>`** — used on the `escrow` account in both `Take` and `Refund`. At the end of the instruction, Anchor zeroes the account data, transfers all remaining lamports to the specified destination, and reassigns the account owner back to the system program, effectively deleting it and reclaiming rent.

**`bump = escrow.bump`** — used on the `escrow` PDA in `Take` and `Refund`. Rather than recomputing the canonical bump via `find_program_address`, Anchor uses the stored bump to verify the PDA derivation, which is cheaper in compute.

**`associated_token::mint`, `associated_token::authority`, `associated_token::token_program`** — used on all token accounts. Anchor verifies that each token account's mint, authority, and token program match the expected values, ensuring no incorrect accounts are smuggled in.

**`mint::token_program`** — used on both mint accounts. Verifies that the mint belongs to the token program passed into the instruction, which is important for Token-2022 compatibility.

---

## Instructions

### Make

The maker opens an escrow by calling this instruction with three arguments: a `u64` seed to make the escrow unique, the `u64` amount of `mint_b` they want to receive, and the `u64` amount of `mint_a` they are depositing.

The program first creates the `escrow` PDA using the seeds `["escrow", maker_pubkey, seed_as_le_bytes]`. It allocates space for the `Escrow` struct (discriminator plus `INIT_SPACE` bytes) and funds the rent from the maker's wallet. It then populates all fields on the escrow account using `set_inner`, including storing the bump from `MakeBumps` so it is available to future instructions.

Next, the program creates the `vault` as an ATA for `mint_a` with the `escrow` PDA as its authority. The vault is also funded by the maker.

Finally, the program performs a `transfer_checked` CPI to the token program, moving the specified deposit amount of `mint_a` from the maker's own ATA (`maker_ata_a`) into the vault. `transfer_checked` is used rather than a plain transfer because it requires the mint and decimal precision to be passed explicitly, preventing a class of precision-manipulation attacks.

After this instruction completes, the maker's tokens are locked in the vault and the escrow is live.

---

### Take

A taker calls this to accept and settle an open escrow. The instruction performs a two-leg exchange.

**Leg 1 — taker pays the maker.** The program calls `transfer_checked` to move exactly `escrow.receive` amount of `mint_b` tokens from the taker's `mint_b` ATA (`taker_ata_b`) to the maker's `mint_b` ATA (`maker_ata_b`). The taker signs this transfer directly as the authority of their own ATA. If `maker_ata_b` does not exist, it is created via `init_if_needed` with the maker paying rent for it.

**Leg 2 — maker's vault pays the taker.** The program calls `transfer_checked` to move all `mint_a` tokens from the vault to the taker's `mint_a` ATA (`taker_ata_a`). Because the vault's authority is the `escrow` PDA, the program reconstructs the signer seeds — `["escrow", escrow.maker, escrow.seed.to_le_bytes(), escrow.bump]` — and passes them to `CpiContext::new_with_signer`. The token program verifies the seeds produce the correct PDA address and authorises the transfer.

After both transfers succeed, the vault token account is closed via `close_account` CPI (also PDA-signed), sending the vault's rent lamports to the maker. The `escrow` account itself is closed by Anchor's `close = maker` constraint, returning its rent to the maker as well.

The `has_one = mint_a`, `has_one = mint_b`, and `has_one = maker` constraints on the escrow account ensure the taker cannot pass in fraudulent accounts to redirect funds.

---

### Refund

The maker calls this to cancel the escrow and recover everything. It can be called at any point while the escrow is still open.

The program reconstructs the escrow PDA signer seeds and calls `transfer_checked` to move the full vault balance — read directly from `vault.amount` rather than using a hardcoded figure — back to the maker's `mint_a` ATA (`maker_ata_a`). It then calls `close_account` (also PDA-signed) to shut down the vault token account and return its rent to the maker.

The `escrow` account is closed by Anchor's `close = maker` constraint, returning its rent to the maker as well.

Access control here is enforced by Anchor account ownership — `maker` is declared as a `Signer`, so the transaction must be signed by the maker's private key. The `has_one = maker` and `has_one = mint_a` constraints on the escrow account further verify that the accounts passed in match what was stored at creation time.

---

## Token Program Compatibility

All token accounts and mints use Anchor SPL's `Interface` and `InterfaceAccount` types rather than the concrete `Token` program types. This means the program is compatible with both the original SPL Token program and Token-2022 out of the box. The token program used for a given escrow is determined at call time by whatever `token_program` account the maker passes in during `Make`, and the same program must be passed consistently across all three instructions. The `mint::token_program` constraint on both mints enforces this, verifying that the mint was created by the declared token program.

---

## Project Structure

```
escrow/
├── Anchor.toml
├── Cargo.toml
├── programs/
│   └── escrow/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs              # Program entrypoint, instruction routing
│           ├── constants.rs        # ESCROW_SEED constant
│           ├── state.rs            # Escrow account definition
│           ├── error.rs            # Custom error codes
│           └── instructions/
│               ├── mod.rs
│               ├── make.rs         # Make accounts and impl
│               ├── take.rs         # Take accounts and impl
│               └── refund.rs       # Refund accounts and impl
└── tests/
    └── test_escrow.rs              # LiteSVM integration tests
```

---

## Prerequisites

- **Rust** — install via [rustup.rs](https://rustup.rs/)
- **Solana CLI** `2.x` — [install guide](https://docs.solanalabs.com/cli/install)
- **Anchor CLI** `1.0.2`

```
cargo install --git https://github.com/coral-xyz/anchor --tag v1.0.2 anchor-cli --locked
```

---

## Building

Run `anchor build` from the workspace root. Anchor compiles the program to a `.so` shared object file at `target/deploy/escrow.so` using `cargo build-sbf` under the hood, which cross-compiles for the `sbf-solana-solana` target (Solana's BPF-like bytecode format). The IDL is generated and written to `target/idl/escrow.json`.

The program ID declared in `declare_id!` inside `lib.rs` must match the key in `[programs.localnet]` inside `Anchor.toml`, and must match the keypair at `target/deploy/escrow-keypair.json`. If they drift out of sync, run `anchor keys sync` to align them before rebuilding.

---

## Testing with LiteSVM

The test suite uses [LiteSVM](https://github.com/LiteSVM/litesvm) rather than `solana-program-test`. LiteSVM runs a full in-process simulation of the Solana runtime — including CPIs, PDA signing, and account rent — without spinning up a validator process. This makes tests start in milliseconds and run deterministically.

LiteSVM loads the compiled program bytecode directly from `target/deploy/escrow.so` using `include_bytes!` at compile time and registers it with the simulated runtime via `add_program`. A test wallet is created with `Keypair::new()` and funded via `svm.airdrop()`.

Transactions are constructed as `VersionedTransaction` using `VersionedMessage::Legacy`, which is the native type that `LiteSVM::send_transaction` accepts. All `solana-*` crates used in tests must be on the same major version to avoid type mismatches at the `send_transaction` call boundary — mixing crate versions causes the `From<Transaction>` trait bound to fail at compile time because Rust treats types from different crate versions as distinct even if they have identical names and shapes.

Build the program before running tests, since the test binary embeds the `.so` at compile time:

```
anchor build
cargo test -p escrow -- --nocapture
```

---

## Deployment

Run `anchor deploy` to deploy to whatever cluster is configured in `Anchor.toml`. For devnet, set `cluster = "devnet"` in `Anchor.toml` or pass `--provider.cluster devnet`. Ensure your wallet has enough SOL to cover the program account rent (determined by the size of the `.so` file) plus transaction fees. After a successful deploy, the program is live at the address declared in `declare_id!`.

# Test Results

## ✅ All Tests Passing

<p align="center">
  <img src="./assets/Screenshot from 2026-05-22 19-11-28.png" alt="Escrow tests passing" width="1000"/>
</p>
