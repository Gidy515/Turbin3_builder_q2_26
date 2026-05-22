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

const commitment: Commitment = "confirmed";

describe("escrow", () => {
  // Configure the client to use the local cluster

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  const connection = provider.connection;

  //payer
  const payer = provider.wallet as NodeWallet;

  //taker
  const taker = Keypair.generate();
});
