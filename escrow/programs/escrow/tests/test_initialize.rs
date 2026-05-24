
use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_keypair::Keypair,
    solana_transaction::versioned::VersionedTransaction,
};

// Setup function to initialize the LiteSVM and load the escrow program with payer keypair
fn setup() -> (LiteSVM, Keypair) {
    let program_id = escrow::id();
    let payer = Keypair::new();
    let mut svm = LiteSVM::new(); // this is the svm simulator instance, it simulates the Solana runtime environment for testing purposes
    let bytes = include_bytes!("../../../target/deploy/escrow.so"); // this is the compiled program's bytecode, which is loaded into the svm for execution
    svm.add_program(program_id, bytes).unwrap(); // this registers the program with the svm, allowing us to call its instructions in our tests
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();

    (svm, payer)
}

#[test]
fn test_initialize() {
    let program_id = escrow::id();
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/escrow.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    
    let instruction = Instruction::new_with_bytes(
        program_id,
        &escrow::instruction::Initialize {}.data(),
        escrow::accounts::Initialize {}.to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();

    let res = svm.send_transaction(tx);
    assert!(res.is_ok());
}
