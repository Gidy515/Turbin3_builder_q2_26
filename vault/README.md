# Vault — Solana Anchor Program

A non-custodial SOL vault program built with Anchor on Solana. Each user gets their own personal vault where they can store, retrieve, and close out their SOL.

---

## How It Works

The program creates two Program Derived Addresses (PDAs) per user:

- **`vault_state`** — a data account that stores bump seeds. Derived from the user's public key, making it unique to each wallet.
- **`vault`** — a pure SOL-holding account with no data. Derived from `vault_state`.

This separation keeps state management clean and ensures the vault is owned and accessible only by the user who created it.

---

## Instructions

### Initialize

Sets up the vault for a user. This is the entry point — it must be called before anything else. The program creates both the `vault_state` and `vault` PDAs, funded by the user's wallet for rent. The vault starts empty with zero lamports.

---

### Deposit

Transfers SOL from the user's wallet into their `vault`. The user specifies the amount in lamports. The transfer is a regular system program CPI from the user's account to the vault PDA.

---

### Withdraw

Transfers SOL from the `vault` back to the user's wallet. The user specifies the amount in lamports. Because the vault is a PDA and has no private key, the program signs the transfer on its behalf using the stored bump seed.

---

### Close

Drains all remaining SOL from the vault back to the user and permanently closes both the `vault` and `vault_state` accounts. The rent from both accounts is returned to the user's wallet. After this instruction, the vault no longer exists and the user would need to call `initialize` again to use it.

---

## Tech Stack

- **Anchor** `1.0.2`
- **LiteSVM** `0.11.0` — used for fast, in-process testing without a local validator
