/*import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Vault } from "../target/types/vault";
import {
  Commitment,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import { BN } from "bn.js";
import { assert, expect } from "chai";

const commitment: Commitment = "confirmed";

describe("vault", () => {
  const confirmTx = async (signature: string) => {
    const latestBlockhash = await anchor
      .getProvider()
      .connection.getLatestBlockhash();
    await anchor.getProvider().connection.confirmTransaction(
      {
        signature,
        ...latestBlockhash,
      },
      commitment
    );
  };

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.vault as Program<Vault>;
  const user = provider.wallet.publicKey;

  // Derive PDAs

  const [vaultStatePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), user.toBuffer()],
    program.programId
  );

  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vaultStatePda.toBuffer()],
    program.programId
  );

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      user,
      10 * LAMPORTS_PER_SOL
    );
    await confirmTx(sig);
  });

  const logExpectedError = (title: string, err: any) => {
    console.log(`\n[Expected Failure] ${title}`);

    // Anchor errors
    if (err?.error?.errorCode) {
      console.log(
        `Code: ${err.error.errorCode.code} (${err.error.errorCode.number})`
      );
    }

    // Human-readable message
    if (err?.error?.errorMessage) {
      console.log(`Message: ${err.error.errorMessage}`);
    } else if (err?.message) {
      console.log(`Message: ${err.message}`);
    }

    // Optional short logs
    if (err?.logs) {
      console.log("Relevant Logs:");
      console.log(err.logs.slice(0, 3).join("\n"));
    }

    console.log("--------------------------------------------------");
  };

  it("Initialized the vault", async () => {
    const tx = await program.methods
      .initialize()
      .accountsStrict({
        user: user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTx(tx);

    const vaultState = await program.account.vaultState.fetch(vaultStatePda);
    expect(vaultState.vaultBump).to.equal(vaultBump);
    expect(vaultState.stateBump).to.equal(stateBump);
  });

  it("Fails when initializing the vault twice", async () => {
    try {
      await program.methods
        .initialize()
        .accountsStrict({
          user,
          vaultState: vaultStatePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      assert.fail("Second initialization should fail");
    } catch (err) {
      logExpectedError("Vault has already been initialized", err);
    }
  });

  it("Deposit 1 SOL into the vault", async () => {
    const depositAmount = 1 * LAMPORTS_PER_SOL;

    const initialVaultBalance = await provider.connection.getBalance(vaultPda);
    const initialUserBalance = await provider.connection.getBalance(user);

    const tx = await program.methods
      .deposit(new BN(depositAmount))
      .accountsStrict({
        user: user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTx(tx);

    const finalBalanceVault = await provider.connection.getBalance(vaultPda);
    const finalBalanceUser = await provider.connection.getBalance(user);

    console.log("Initial Vault Balance:", initialVaultBalance);
    console.log("Final Vault Balance:", finalBalanceVault);

    expect(finalBalanceVault).to.equal(initialVaultBalance + depositAmount);
    expect(finalBalanceUser).to.be.lessThan(initialUserBalance - depositAmount);
  });

  it("Fails when another user tries to withdraw", async () => {
    const attacker = anchor.web3.Keypair.generate();

    const sig = await provider.connection.requestAirdrop(
      attacker.publicKey,
      2 * LAMPORTS_PER_SOL
    );

    await confirmTx(sig);

    const attackerProvider = new anchor.AnchorProvider(
      provider.connection,
      new NodeWallet(attacker),
      provider.opts
    );

    const attackerProgram = new Program<Vault>(program.idl, attackerProvider);

    try {
      await attackerProgram.methods
        .withdraw(new BN(0.1 * LAMPORTS_PER_SOL))
        .accountsStrict({
          user: attacker.publicKey,
          vaultState: vaultStatePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();

      assert.fail("Unauthorized withdrawal should fail");
    } catch (err) {
      console.log("Expected unauthorized failure:", err);
    }
  });

  it("Withdraw 0.5 SOL from the vault", async () => {
    const withdrawAmount = 0.5 * LAMPORTS_PER_SOL;

    const initialVaultBalance = await provider.connection.getBalance(vaultPda);
    const initialUserBalance = await provider.connection.getBalance(user);

    const tx = await program.methods
      .withdraw(new BN(withdrawAmount))
      .accountsStrict({
        user: user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTx(tx);

    const finalBalanceVault = await provider.connection.getBalance(vaultPda);
    const finalBalanceUser = await provider.connection.getBalance(user);

    expect(finalBalanceVault).to.equal(initialVaultBalance - withdrawAmount);
    expect(finalBalanceUser).to.be.greaterThan(initialUserBalance);

    console.log(
      "Initial Vault Balance before withdrawal:",
      initialVaultBalance
    );
    console.log("Final Vault Balance after withdrawal:", finalBalanceVault);
  });

  it("Fails when withdrawing more than vault balance", async () => {
    const excessiveAmount = new BN(100 * LAMPORTS_PER_SOL);

    try {
      await program.methods
        .withdraw(excessiveAmount)
        .accountsStrict({
          user,
          vaultState: vaultStatePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      assert.fail("Transaction should have failed");
    } catch (err) {
      console.log("Expected failure:", err);
    }
  });

  it("Close the vault and transfer all funds to the user", async () => {
    const initialUserBalance = await provider.connection.getBalance(user);

    const tx = await program.methods
      .close()
      .accountsStrict({
        user: user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    confirmTx(tx);

    expect(await provider.connection.getBalance(vaultPda)).to.equal(0);

    const vaultStateInfo = await provider.connection.getAccountInfo(
      vaultStatePda
    );
    expect(vaultStateInfo).to.be.null;

    const finalBalanceUser = await provider.connection.getBalance(user);

    expect(finalBalanceUser).to.be.greaterThan(initialUserBalance);

    console.log(
      "Initial User Balance before closing vault:",
      initialUserBalance
    );
    console.log("Final User Balance after closing vault:", finalBalanceUser);
  });

  it("Fails to deposit after vault is closed", async () => {
    try {
      await program.methods
        .deposit(new BN(0.1 * LAMPORTS_PER_SOL))
        .accountsStrict({
          user,
          vaultState: vaultStatePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      assert.fail("Deposit after close should fail");
    } catch (err) {
      console.log("Expected failure after close:", err);
    }
  });
});*/
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Vault } from "../target/types/vault";

import {
  Commitment,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";

import { BN } from "bn.js";
import { assert, expect } from "chai";

const commitment: Commitment = "confirmed";

describe("vault", () => {
  const confirmTx = async (signature: string) => {
    const latestBlockhash = await anchor
      .getProvider()
      .connection.getLatestBlockhash();

    await anchor.getProvider().connection.confirmTransaction(
      {
        signature,
        ...latestBlockhash,
      },
      commitment
    );
  };

  // Clean error logger
  const logExpectedError = (title: string, err: any) => {
    console.log(`\n[Expected Failure] ${title}`);

    // Anchor-specific error codes
    if (err?.error?.errorCode) {
      console.log(
        `Code: ${err.error.errorCode.code} (${err.error.errorCode.number})`
      );
    }

    if (err?.error?.errorMessage) {
      console.log(`Message: ${err.error.errorMessage}`);
    } else if (err?.message) {
      console.log(`Message: ${err.message}`);
    }

    // Shortened logs
    if (err?.logs) {
      console.log("Relevant Logs:");
      console.log(err.logs.slice(0, 3).join("\n"));
    }

    console.log("--------------------------------------------------");
  };

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.vault as Program<Vault>;

  const user = provider.wallet.publicKey;

  // =========================
  // PDA Derivations
  // =========================

  const [vaultStatePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), user.toBuffer()],
    program.programId
  );

  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vaultStatePda.toBuffer()],
    program.programId
  );

  // Setup

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      user,
      10 * LAMPORTS_PER_SOL
    );

    await confirmTx(sig);
  });

  // Initialize

  it("Initialized the vault", async () => {
    const tx = await program.methods
      .initialize()
      .accountsStrict({
        user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTx(tx);

    const vaultState = await program.account.vaultState.fetch(vaultStatePda);

    expect(vaultState.vaultBump).to.equal(vaultBump);
    expect(vaultState.stateBump).to.equal(stateBump);

    console.log("Vault initialized successfully");
  });

  // Double Init Failure

  it("Fails when initializing the vault twice", async () => {
    try {
      await program.methods
        .initialize()
        .accountsStrict({
          user,
          vaultState: vaultStatePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      assert.fail("Second initialization should fail");
    } catch (err) {
      logExpectedError("Double initialization", err);
    }
  });

  // Deposit

  it("Deposit 1 SOL into the vault", async () => {
    const depositAmount = 1 * LAMPORTS_PER_SOL;

    const initialVaultBalance = await provider.connection.getBalance(vaultPda);

    const initialUserBalance = await provider.connection.getBalance(user);

    const tx = await program.methods
      .deposit(new BN(depositAmount))
      .accountsStrict({
        user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTx(tx);

    const finalVaultBalance = await provider.connection.getBalance(vaultPda);

    const finalUserBalance = await provider.connection.getBalance(user);

    expect(finalVaultBalance).to.equal(initialVaultBalance + depositAmount);

    expect(finalUserBalance).to.be.lessThan(initialUserBalance - depositAmount);

    console.log(
      `Vault Balance: ${initialVaultBalance} -> ${finalVaultBalance}`
    );
  });

  // Unauthorized Withdraw

  it("Fails when another user tries to withdraw", async () => {
    const attacker = anchor.web3.Keypair.generate();

    const sig = await provider.connection.requestAirdrop(
      attacker.publicKey,
      2 * LAMPORTS_PER_SOL
    );

    await confirmTx(sig);

    const attackerProvider = new anchor.AnchorProvider(
      provider.connection,
      new NodeWallet(attacker),
      provider.opts
    );

    const attackerProgram = new Program<Vault>(program.idl, attackerProvider);

    try {
      await attackerProgram.methods
        .withdraw(new BN(0.1 * LAMPORTS_PER_SOL))
        .accountsStrict({
          user: attacker.publicKey,
          vaultState: vaultStatePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();

      assert.fail("Unauthorized withdrawal should fail");
    } catch (err) {
      logExpectedError("Unauthorized withdrawal", err);
    }
  });

  // Withdraw

  it("Withdraw 0.5 SOL from the vault", async () => {
    const withdrawAmount = 0.5 * LAMPORTS_PER_SOL;

    const initialVaultBalance = await provider.connection.getBalance(vaultPda);

    const initialUserBalance = await provider.connection.getBalance(user);

    const tx = await program.methods
      .withdraw(new BN(withdrawAmount))
      .accountsStrict({
        user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTx(tx);

    const finalVaultBalance = await provider.connection.getBalance(vaultPda);

    const finalUserBalance = await provider.connection.getBalance(user);

    expect(finalVaultBalance).to.equal(initialVaultBalance - withdrawAmount);

    expect(finalUserBalance).to.be.greaterThan(initialUserBalance);

    console.log(
      `Vault Balance After Withdrawal: ${initialVaultBalance} -> ${finalVaultBalance}`
    );
  });

  // Excessive Withdraw Failure

  it("Fails when withdrawing more than vault balance", async () => {
    const excessiveAmount = new BN(100 * LAMPORTS_PER_SOL);

    try {
      await program.methods
        .withdraw(excessiveAmount)
        .accountsStrict({
          user,
          vaultState: vaultStatePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      assert.fail("Transaction should have failed");
    } catch (err) {
      logExpectedError("Withdraw exceeds vault balance", err);
    }
  });

  // Close Vault

  it("Close the vault and transfer all funds to the user", async () => {
    const initialUserBalance = await provider.connection.getBalance(user);

    const tx = await program.methods
      .close()
      .accountsStrict({
        user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTx(tx);

    expect(await provider.connection.getBalance(vaultPda)).to.equal(0);

    const vaultStateInfo = await provider.connection.getAccountInfo(
      vaultStatePda
    );

    expect(vaultStateInfo).to.be.null;

    const finalUserBalance = await provider.connection.getBalance(user);

    expect(finalUserBalance).to.be.greaterThan(initialUserBalance);

    console.log(
      `User Balance After Close: ${initialUserBalance} -> ${finalUserBalance}`
    );
  });

  // Deposit After Close Failure

  it("Fails to deposit after vault is closed", async () => {
    try {
      await program.methods
        .deposit(new BN(0.1 * LAMPORTS_PER_SOL))
        .accountsStrict({
          user,
          vaultState: vaultStatePda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      assert.fail("Deposit after close should fail");
    } catch (err) {
      logExpectedError("Deposit after vault close", err);
    }
  });
});
