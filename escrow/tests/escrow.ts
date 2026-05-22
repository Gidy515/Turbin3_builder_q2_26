import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Escrow } from "../target/types/escrow";
import {
  Commitment,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import { BN } from "bn.js";
import { assert, expect } from "chai";
import { randomBytes } from "crypto";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { SYSTEM_PROGRAM_ID } from "@anchor-lang/core/dist/cjs/native/system";

const commitment: Commitment = "confirmed";

describe("escrow", () => {
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

  const confirmTxs = async (signatures: string[]) => {
    await Promise.all(signatures.map(confirmTx));
  };
  // Configure the client to use the local cluster

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  const connection = provider.connection;

  //payer
  const payer = provider.wallet as NodeWallet;

  //taker
  const taker = Keypair.generate();

  let mintA: PublicKey;
  let mintB: PublicKey;

  let makerAtaA: PublicKey;
  let makerAtaB: PublicKey;

  let takerAtaA: PublicKey;
  let takerAtaB: PublicKey;

  let vault: PublicKey;

  const seed = new BN(randomBytes(8));

  const escrow = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), payer.publicKey.toBuffer(), seed.toBuffer("le", 8)],
    program.programId
  )[0];

  it("Request airdrop to payer and taker", async () => {
    await Promise.all(
      [payer, taker].map(async (k) => {
        return await anchor
          .getProvider()
          .connection.requestAirdrop(
            k.publicKey,
            100 * anchor.web3.LAMPORTS_PER_SOL
          );
      })
    ).then(confirmTxs);
  });

  it("Mint tokens to maker and taker", async () => {
    //creating mints

    mintA = await createMint(
      connection,
      payer.payer,
      provider.publicKey,
      provider.publicKey,
      6
    );
    console.log("Mint A: ", mintA.toBase58());

    mintB = await createMint(
      connection,
      payer.payer, // Payer of the transaction and initialization fees which is the maker(payer)
      provider.publicKey, // Account or multisig that will control minting
      provider.publicKey, // Optional account or multisig that can freeze token accounts
      6 // The Decimals: Location of the decimal place
    );
    console.log("Mint B: ", mintB.toBase58());

    vault = getAssociatedTokenAddressSync(
      mintA, // The token we are minting to the vault's associated token account
      escrow, // The owner of the vault account, which is the escrow
      true // True because the account is a PDA, if it's not it'll be false
    );

    makerAtaA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        mintA,
        provider.publicKey
      )
    ).address;

    makerAtaB = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        mintB,
        provider.publicKey
      )
    ).address;

    takerAtaA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        mintA,
        taker.publicKey
      )
    ).address;

    takerAtaB = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        mintB,
        taker.publicKey
      )
    ).address;

    // Mint some tokens A and B to maker and taker
    await mintTo(
      connection, // connection
      payer.payer, // payer of txn fees
      mintA, // token mint for the
      makerAtaA, // destination of account to mint to
      payer.payer, // minting authority
      1000_000_000 // amount to mint
    );
    console.log("Minted 1000 tokens to maker's ATA A:", makerAtaA.toBase58());

    await mintTo(
      connection, // connection
      payer.payer, // payer of txn fees
      mintB, // token mint for the
      takerAtaB, // destination of account to mint to
      payer.payer, // minting authority
      1000_000_000 // amount to mint
    );
    console.log("Minted 1000 tokens to taker's ATA B:", takerAtaA.toBase58());
  });

  it("Maker initializes the escrow", async () => {
    const initialMakerAtaABalance = await connection.getTokenAccountBalance(
      makerAtaA
    );
    console.log(
      "Maker's ATA A balance before escrow initialization:",
      initialMakerAtaABalance.value.amount
    );

    const tx = await program.methods
      .make(
        seed,
        new BN(1_000_000), // Token A to be given
        new BN(1_000_000) // Token B to be received
      )
      .accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow,
        vault: vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .rpc();
    await confirmTx(tx);

    const finalVaultBalance = await connection.getTokenAccountBalance(vault);
    console.log(
      "Vault balance after escrow initialization:",
      finalVaultBalance.value.amount
    );

    const finalMakerAtaABalance = await connection.getTokenAccountBalance(
      makerAtaA
    );
    console.log(
      "Maker's ATA A balance after escrow initialization:",
      finalMakerAtaABalance.value.amount
    );

    console.log("Make offer transaction:", tx);
  });

  xit("Taker accepts the escrow and pays to maker", async () => {
    const tx = await program.methods
      .take(seed)
      .accountsStrict({
        taker: taker.publicKey,
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        takerAtaA: takerAtaA,
        takerAtaB: takerAtaB,
        makerAtaB: makerAtaB,
        escrow: escrow,
        vault: vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .signers([taker])
      .rpc();

    await confirmTx(tx);

    expect(await provider.connection.getBalance(vault)).to.equal(0); //
    const vaultStateInfo = await provider.connection.getAccountInfo(vault);
    expect(vaultStateInfo).to.be.null;

    console.log("Take transaction: ", tx);
  });

  it("Refund from vault", async () => {
    const tx = await program.methods
      .refund(seed)
      .accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        makerAtaA: makerAtaA,
        escrow: escrow,
        vault: vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .rpc();

    expect(await provider.connection.getBalance(vault)).to.equal(0); //
    const vaultStateInfo = await provider.connection.getAccountInfo(vault);
    expect(vaultStateInfo).to.be.null;

    console.log("Refund transaction: ", tx);
  });
});
