use {
    anchor_lang::{
        prelude::{msg},
        solana_program::instruction::Instruction,
        system_program::ID as SYSTEM_PROGRAM_ID,
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::Transaction,
};

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

    let (vault_state_pda, state_bump) = Pubkey::find_program_address(&[b"state", user.as_ref()], &vault::id());

    let (vault_pda, vault_bump) = Pubkey::find_program_address(&[b"vault", vault_state_pda.as_ref()], &vault::id());

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

    let tx1 = svm.send_transaction(transaction).unwrap();

    msg!("Vault initialized successfully");
    msg!("Transaction signature: {}", tx1.signature);

    let vault_state_account = svm.get_account(&vault_state_pda).unwrap();
    let vault_state = vault::state::VaultState::try_deserialize(&mut vault_state_account.data.as_ref()).unwrap();

    assert_eq!(vault_state.vault_bump, vault_bump);
    assert_eq!(vault_state.state_bump, state_bump);

    // Deposit 1 SOL

    let deposit_amount: u64 = 2_000_000_000;

    let deposit_ix = Instruction {
        program_id: vault::id(),
        accounts: vault::accounts::Deposit {
            user,
            vault_state: vault_state_pda,
            vault: vault_pda,
            system_program: SYSTEM_PROGRAM_ID,
        }.to_account_metas(None),
        data: vault::instruction::Deposit {amount: deposit_amount}.data(),
    };

    let message = Message::new(&[deposit_ix], Some(&payer.pubkey()));
    let recent_blockhash = svm.latest_blockhash();
    let transaction2 = Transaction::new(&[&payer], message, recent_blockhash);

    let tx2 = svm.send_transaction(transaction2).unwrap();

    msg!("SOL sent to Vault successfully");
    msg!("Transaction signature: {}", tx2.signature);

    let vault_balance_after_deposit = svm.get_balance(&vault_pda).unwrap();
    assert_eq!(vault_balance_after_deposit, deposit_amount);

    msg!("Balance after deposit: {}", vault_balance_after_deposit);

    // Withdraw 1 SOL

    let withdraw_amount: u64 = 1_000_000_000;

    let withdraw_ix = Instruction {
        program_id: vault::id(),
        accounts: vault::accounts::Withdraw {
            user,
            vault_state: vault_state_pda,
            vault: vault_pda,
            system_program: SYSTEM_PROGRAM_ID,
        }.to_account_metas(None),
        data: vault::instruction::Withdraw {amount: withdraw_amount}.data(),
    };

    let message = Message::new(&[withdraw_ix], Some(&payer.pubkey()));
    let recent_blockhash = svm.latest_blockhash();
    let transaction3 = Transaction::new(&[&payer], message, recent_blockhash);

    let tx3 = svm.send_transaction(transaction3).unwrap();

    msg!("SOL withdrew to Vault successfully");
    msg!("Transaction signature: {}", tx3.signature);

    let vault_balance_after_withdrawal = svm.get_balance(&vault_pda).unwrap();
    assert_eq!(vault_balance_after_withdrawal, withdraw_amount);

    msg!("Balance after deposit: {}", vault_balance_after_withdrawal);

    // Close

    let close_amount = svm.get_balance(&vault_pda).unwrap();
    
    let close_ix = Instruction {
        program_id: vault::id(),
        accounts: vault::accounts::Close {
            user,
            vault_state: vault_state_pda,
            vault: vault_pda,
            system_program: SYSTEM_PROGRAM_ID,
        }.to_account_metas(None),
        data: vault::instruction::Close {}.data(),
    };

    let message = Message::new(&[close_ix], Some(&payer.pubkey()));
    let recent_blockhash = svm.latest_blockhash();
    let transaction4 = Transaction::new(&[&payer], message, recent_blockhash);

    let tx4 = svm.send_transaction(transaction4).unwrap();

    msg!("SOL sent to Vault successfully");
    msg!("Transaction signature: {}", tx4.signature);

    assert!(svm.get_account(&vault_pda).is_none());
    assert!(svm.get_account(&vault_state_pda).is_none());

    let user_balance_after_close = svm.get_balance(&user).unwrap();
    assert!(user_balance_after_close > close_amount);
    msg!("Balance after deposit: {}", vault_balance_after_withdrawal);
}
