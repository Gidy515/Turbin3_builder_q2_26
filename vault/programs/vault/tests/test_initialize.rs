
/*use {
    anchor_lang::{InstructionData, ToAccountMetas, solana_program::instruction::Instruction, system_program::ID as SYSTEM_PROGRAM_ID}, 
    litesvm::LiteSVM, solana_keypair::Keypair, 
    solana_message::{Message, VersionedMessage}, 
    solana_pubkey::Pubkey, solana_signer::Signer, 
    solana_transaction::{
        //Transaction, 
        versioned::VersionedTransaction}
};*/

use {
    anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas, solana_program::instruction::Instruction, system_program::ID as SYSTEM_PROGRAM_ID}, litesvm::LiteSVM, solana_keypair::Keypair, solana_message::Message, solana_pubkey::Pubkey, solana_sdk::msg, solana_signer::Signer, solana_transaction::Transaction, vault::vault  // ✅ modular crate, matches litesvm
};

/*use solana_sdk::{
    transaction::Transaction,
};*/

fn setup() -> (LiteSVM, Keypair) {
    let program_id = vault::id();
    let payer = Keypair::new();
    let mut svm = LiteSVM::new(); // this is the svm simulator instance, it simulates the Solana runtime environment for testing purposes
    let bytes = include_bytes!("../../../target/deploy/vault.so"); // this is the compiled program's bytecode, which is loaded into the svm for execution
    svm.add_program(program_id, bytes).unwrap(); // this registers the program with the svm, allowing us to call its instructions in our tests
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();

    (svm, payer)
}

#[test]
fn test_initialize_deposit_withdraw_close() {

    let (mut svm, payer) = setup();
    let user = payer.pubkey();

    let (vault_state_pda, _state_bump) = Pubkey::find_program_address(&[b"state", user.as_ref()], &vault::id());

    let (vault_pda, _vault_bump) = Pubkey::find_program_address(&[b"vault", vault_state_pda.as_ref()], &vault::id());

    // Initialize
    let init_tx = Instruction {
        program_id: vault::id(),
        accounts: vault::accounts::Initialize {
            user,
            vault_state: vault_state_pda,
            vault: vault_pda,
            system_program: SYSTEM_PROGRAM_ID,
        }.to_account_metas(None),
        data: vault::instruction::Initialize {}.data(),
    };

    let message = Message::new(&[init_tx], Some(&payer.pubkey()));
    let recent_blockhash = svm.latest_blockhash();
    let transaction = Transaction::new(&[&payer], message, recent_blockhash);
    let tx_1 = svm.send_transaction(transaction).unwrap();


    msg!("Vault initialized successfully");
    msg!("Transaction signature: {}", tx_1.signature);

    let vault_state_account = svm.get_account(&vault_state_pda).unwrap();
    let vault_state = vault::state::VaultState::try_deserialize(&mut vault_state_account.data.as_ref()).unwrap();
    /*let instruction = Instruction::new_with_bytes(
        program_id,
        &vault::instruction::Initialize {}.data(),
        vault::accounts::Initialize {}.to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();

    let res = svm.send_transaction(tx);
    assert!(res.is_ok());*/
}
