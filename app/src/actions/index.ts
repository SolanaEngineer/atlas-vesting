import idl from './idl.json';

import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as anchor from '@project-serum/anchor';
import { Connection, Keypair, PublicKey, SystemProgram,  SYSVAR_CLOCK_PUBKEY,  SYSVAR_RENT_PUBKEY,  Transaction,  TransactionInstruction } from '@solana/web3.js';
import { WalletNotConnectedError } from '@solana/wallet-adapter-base';
import { checkWalletATA, createTokenAccountIfNotExist, sendTransaction } from './web3';
import { closeAccount } from '@project-serum/serum/lib/token-instructions';

export const WSOL_MINT_KEY = new PublicKey(
    'So11111111111111111111111111111111111111112',
  );

export const LP1_MINT_KEY = new PublicKey(
    '6LVzyv6jnPTjWHmZni6rMScVfUf6GAZeNoxQz9PNyccX',
  );

export const GLOBAL_STATE_TAG = "golbal-state-seed";
export const TOKEN_VAULT_TAG = "token-vault-seed";
export const USER_TROVE_TAG = "user-trove-seed";
export const USD_MINT_TAG = "usd-mint";
export const TOKEN_VAULT_POOL_TAG = "token-vault-pool";

export const STABLE_POOL_PROGRAM_ID = new PublicKey(
  '2zVfJtu8N6Cd5UkCLcSRUcLD1afdVpAuqik6s9sL5vS6',
);
export const STABLE_POOL_IDL = idl;
export const USD_DECIMALS = 6; 


// This command makes an Lottery
export function getProgramInstance(
  connection: Connection,
  wallet: any,
) {
  if (!wallet.publicKey) throw new WalletNotConnectedError();

  const provider = new anchor.Provider(
    connection,
    wallet,
    anchor.Provider.defaultOptions(),
  );
  // Read the generated IDL.
  const idl = STABLE_POOL_IDL as any;

  // Address of the deployed program.
  const programId = STABLE_POOL_PROGRAM_ID;

  // Generate the program client from IDL.
  const program = new (anchor as any).Program(idl, programId, provider);

  return program;
}


// This command makes an Lottery
export async function createGlobalState(
  connection: Connection,
  wallet: any,
) {
  if (!wallet.publicKey) throw new WalletNotConnectedError();

  const program = getProgramInstance(connection, wallet);
  const [globalStateKey, globalStateNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(GLOBAL_STATE_TAG)],
      program.programId,
    );
    console.log("globalStateKey",globalStateKey.toBase58());
  const [mintUsdKey, mintUsdNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(USD_MINT_TAG)],
      program.programId,
    );
  console.log("mintUsdKey",mintUsdKey.toBase58());
  try{
    const globalState = await program.account.globalState.fetch(globalStateKey);
    console.log("already created")
    console.log("globalState",globalState);
    return "already created";
  }
  catch(e){
    console.log(e)
  }
  
  let instructions:TransactionInstruction[] = [];
  const signers:Keypair[] = [];
  try{
    await program.rpc.createGlobalState(
      globalStateNonce, 
      mintUsdNonce, 
      {
        accounts: {
          superOwner: wallet.publicKey,
          mintUsd: mintUsdKey,
          globalState: globalStateKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        },
        instructions:instructions,
        signers:signers
      }
    );
  }
  catch(e){
    console.log("can't create global state")
  }

  return "created global state";
}

export async function borrowUSDr(
    connection: Connection,
    wallet: any,
    amount:number,
    mintCollKey:PublicKey = WSOL_MINT_KEY,
  ) {
    if (!wallet.publicKey) throw new WalletNotConnectedError();
  
    const program = getProgramInstance(connection, wallet);
  
    const [globalStateKey, globalStateNonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_STATE_TAG)],
        program.programId,
      );
      
    const [tokenVaultKey, tokenVaultNonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(TOKEN_VAULT_TAG), mintCollKey.toBuffer()],
        program.programId,
      );
    const [userTroveKey, userTroveNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(USER_TROVE_TAG), tokenVaultKey.toBuffer(),wallet.publicKey.toBuffer()],
      program.programId,
    );
    const [mintUsdKey, mintUsdNonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(USD_MINT_TAG)],
        program.programId,
      );
  
    const globalState = await program.account.globalState.fetch(globalStateKey);
  
    const paramUserUsdTokenKey = await checkWalletATA(connection, wallet.publicKey,globalState.mintUsd.toBase58());
  
    const transaction = new Transaction()
    let instructions:TransactionInstruction[] = [];
    const signers:Keypair[] = [];
  
    const userUsdTokenKey = await createTokenAccountIfNotExist(
      connection, 
      paramUserUsdTokenKey, 
      wallet.publicKey, 
      globalState.mintUsd.toBase58(),
      null,
      transaction,
      signers
    )
    
    const borrowInstruction = await program.instruction.borrowUsd(
      new anchor.BN(amount), 
      tokenVaultNonce,
      userTroveNonce,
      globalStateNonce,
      mintUsdNonce,
      {
        accounts: {
          owner: wallet.publicKey,
          tokenVault: tokenVaultKey,
          userTrove: userTroveKey,
          globalState: globalStateKey,
          mintUsd: mintUsdKey,
          userTokenUsd: userUsdTokenKey,
          mintColl: mintCollKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: SYSVAR_CLOCK_PUBKEY,
        },
      }
    );
    instructions.push(borrowInstruction);
  
    instructions.forEach((instruction)=>{
      transaction.add(instruction);
    })
    
    let tx = await sendTransaction(connection, wallet, transaction, signers);
    console.log("tx id->",tx);
  
    return "User borrowed "+(amount / Math.pow(10, USD_DECIMALS))+" USD , transaction id = "+tx;
  
  }
  

export async function createTokenVault(
  connection: Connection,
  wallet: any,
  mintCollKey: PublicKey = WSOL_MINT_KEY
) {
  if (!wallet.publicKey) throw new WalletNotConnectedError();

  const program = getProgramInstance(connection, wallet);

  const [globalStateKey, globalStateNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(GLOBAL_STATE_TAG)],
      program.programId,
    );
    console.log("GlobalStateKey", globalStateKey.toBase58());
  const globalState = await program.account.globalState.fetch(globalStateKey);
  console.log("fetched globalState", globalState);

  const [tokenVaultKey, tokenVaultNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(TOKEN_VAULT_TAG), mintCollKey.toBuffer()],
      program.programId,
    );
  console.log("tokenVaultKey",tokenVaultKey.toBase58());
  const [tokenCollKey, tokenCollNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(TOKEN_VAULT_POOL_TAG), tokenVaultKey.toBuffer()],
      program.programId,
    );
    console.log("tokenCollKey",tokenCollKey.toBase58());
  try {
    const tokenVault = await program.account.tokenVault.fetch(tokenVaultKey);
    console.log("fetched tokenVault", tokenVault);
    console.log("This token vault was already created!")
    return "already created";
  }
  catch (e) {
  }

  try {
    await program.rpc.createTokenVault(
      tokenVaultNonce, 
      globalStateNonce, 
      tokenCollNonce, 
      {
        accounts: {
          payer: wallet.publicKey,
          tokenVault: tokenVaultKey,
          globalState: globalStateKey,
          mintColl: mintCollKey,
          tokenColl: tokenCollKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        },
      }
    );
  }
  catch (e) {
    console.log("can't create token vault")
  }
  return "created token vault successfully" ;
}
  

export async function createUserTrove(
  connection: Connection,
  wallet: any,
  mintCollKey:PublicKey = WSOL_MINT_KEY
) {
  if (!wallet.publicKey) throw new WalletNotConnectedError();

  const program = getProgramInstance(connection, wallet);

  const [tokenVaultKey, tokenVaultNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(TOKEN_VAULT_TAG), mintCollKey.toBuffer()],
      program.programId,
    );
  const [userTroveKey, userTroveNonce] =
  await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(USER_TROVE_TAG), tokenVaultKey.toBuffer(),wallet.publicKey.toBuffer()],
    program.programId,
  );
  try{
    const userTrove = await program.account.userTrove.fetch(userTroveKey);
    console.log("fetched userTrove", userTrove);
    console.log("This user trove was already created!")
    return "already created!"; 
  }
  catch(e){
  }
  

  try{
    await program.rpc.createUserTrove(
      userTroveNonce, 
      tokenVaultNonce, 
      {
        accounts: {
          troveOwner: wallet.publicKey,
          userTrove: userTroveKey,
          tokenVault: tokenVaultKey,
          mintColl:mintCollKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        },
      }
    );
  }
  catch(e){
    console.log("can't create user trove")
  }
  return "created user trove successfully!";
}

export async function depositCollateral(
  connection: Connection,
  wallet: any,
  amount:number,
  userCollAddress: string | null = null,
  mintCollKey:PublicKey = WSOL_MINT_KEY,
) {
  if (!wallet.publicKey) throw new WalletNotConnectedError();

  const program = getProgramInstance(connection, wallet);

  const [globalStateKey] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(GLOBAL_STATE_TAG)],
      program.programId,
    );
  const globalState = await program.account.globalState.fetch(globalStateKey);
  console.log("fetched globalState", globalState);

  const [tokenVaultKey, tokenVaultNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(TOKEN_VAULT_TAG), mintCollKey.toBuffer()],
      program.programId,
    );
  const [tokenCollKey, tokenCollNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(TOKEN_VAULT_POOL_TAG), tokenVaultKey.toBuffer()],
      program.programId,
    );
  const [userTroveKey, userTroveNonce] =
  await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(USER_TROVE_TAG), tokenVaultKey.toBuffer(),wallet.publicKey.toBuffer()],
    program.programId,
  );
  
  const transaction = new Transaction()
  let instructions:TransactionInstruction[] = [];
  const signers:Keypair[] = [];

  let userCollKey = null;

  let accountRentExempt = await connection.getMinimumBalanceForRentExemption(
    AccountLayout.span
    );
    
  userCollKey = await createTokenAccountIfNotExist(
    program.provider.connection, 
    userCollAddress, 
    wallet.publicKey, 
    mintCollKey.toBase58(),
    accountRentExempt+amount,
    transaction,
    signers
    )
  
  const depositInstruction = await program.instruction.depositCollateral(
    new anchor.BN(amount), 
    tokenVaultNonce,
    userTroveNonce,
    tokenCollNonce,
    {
      accounts: {
        owner: wallet.publicKey,
        userTrove: userTroveKey,
        tokenVault: tokenVaultKey,
        poolTokenColl: tokenCollKey,
        userTokenColl: userCollKey,
        mintColl: mintCollKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    }
  );
  instructions.push(depositInstruction);

  

  if (mintCollKey.toBase58() === WSOL_MINT_KEY.toBase58()) {
    instructions.push(
      closeAccount({
        source: userCollKey,
        destination: wallet.publicKey,
        owner:wallet.publicKey
      })
    )
  }
  instructions.forEach((instruction)=>{
    transaction.add(instruction);
  })
  
  let tx = await sendTransaction(connection, wallet, transaction, signers);
  console.log("tx id->",tx);

  return "User deposited "+(amount / Math.pow(10, 9))+" SOL, transaction id = "+tx;
}

export async function repayUSDr(
  connection: Connection,
  wallet: any,
  amount:number,
  mintCollKey:PublicKey = WSOL_MINT_KEY,
) {
  if (!wallet.publicKey) throw new WalletNotConnectedError();

  const program = getProgramInstance(connection, wallet);

  const [globalStateKey, globalStateNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(GLOBAL_STATE_TAG)],
      program.programId,
    );
    
  const [tokenVaultKey, tokenVaultNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(TOKEN_VAULT_TAG), mintCollKey.toBuffer()],
      program.programId,
    );
  const [userTroveKey, userTroveNonce] =
  await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(USER_TROVE_TAG), tokenVaultKey.toBuffer(),wallet.publicKey.toBuffer()],
    program.programId,
  );
  const [mintUsdKey, mintUsdNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(USD_MINT_TAG)],
      program.programId,
    );

  const globalState = await program.account.globalState.fetch(globalStateKey);

  const paramUserUsdTokenKey = await checkWalletATA(connection, wallet.publicKey,globalState.mintUsd.toBase58());

  const transaction = new Transaction()
  let instructions:TransactionInstruction[] = [];
  const signers:Keypair[] = [];

  const userUsdTokenKey = await createTokenAccountIfNotExist(
    connection, 
    paramUserUsdTokenKey, 
    wallet.publicKey, 
    globalState.mintUsd.toBase58(),
    null,
    transaction,
    signers
  )
  
  const repayInstruction = await program.instruction.repayUsd(
    new anchor.BN(amount), 
    tokenVaultNonce,
    userTroveNonce,
    globalStateNonce,
    mintUsdNonce,
    {
      accounts: {
        owner: wallet.publicKey,
        tokenVault: tokenVaultKey,
        userTrove: userTroveKey,
        globalState: globalStateKey,
        mintUsd: mintUsdKey,
        userTokenUsd: userUsdTokenKey,
        mintColl: mintCollKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    }
  );
  instructions.push(repayInstruction);

  instructions.forEach((instruction)=>{
    transaction.add(instruction);
  })
  
  let tx = await sendTransaction(connection, wallet, transaction, signers);
  console.log("tx id->",tx);

  return "User repaid "+(amount / Math.pow(10, USD_DECIMALS))+" USD , transaction id = "+tx;

}

export async function withdrawCollateral(
  connection: Connection,
  wallet: any,
  amount:number,
  userCollAddress: string | null = null,
  mintCollKey:PublicKey = WSOL_MINT_KEY,
) {
  if (!wallet.publicKey) throw new WalletNotConnectedError();

  const program = getProgramInstance(connection, wallet);

  const [globalStateKey] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(GLOBAL_STATE_TAG)],
      program.programId,
    );
  const globalState = await program.account.globalState.fetch(globalStateKey);
  console.log("fetched globalState", globalState);

  const [tokenVaultKey, tokenVaultNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(TOKEN_VAULT_TAG), mintCollKey.toBuffer()],
      program.programId,
    );
  const [tokenCollKey, tokenCollNonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(TOKEN_VAULT_POOL_TAG), tokenVaultKey.toBuffer()],
      program.programId,
    );
  const [userTroveKey, userTroveNonce] =
  await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(USER_TROVE_TAG), tokenVaultKey.toBuffer(),wallet.publicKey.toBuffer()],
    program.programId,
  );

  const transaction = new Transaction()
  let instructions:TransactionInstruction[] = [];
  const signers:Keypair[] = [];

  let userCollKey = null;

  userCollKey = await createTokenAccountIfNotExist(
    program.provider.connection, 
    userCollAddress, 
    wallet.publicKey, 
    mintCollKey.toBase58(),
    null,
    transaction,
    signers
    )
  
  const withdrawInstruction = await program.instruction.withdrawCollateral(
    new anchor.BN(amount), 
    tokenVaultNonce,
    userTroveNonce,
    tokenCollNonce,
    {
      accounts: {
        owner: wallet.publicKey,
        userTrove: userTroveKey,
        tokenVault: tokenVaultKey,
        poolTokenColl: tokenCollKey,
        userTokenColl: userCollKey,
        mintColl: mintCollKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    }
  );
  instructions.push(withdrawInstruction);

  

  if (mintCollKey.toBase58() === WSOL_MINT_KEY.toBase58()) {
    instructions.push(
      closeAccount({
        source: userCollKey,
        destination: wallet.publicKey,
        owner:wallet.publicKey
      })
    )
  }
  instructions.forEach((instruction)=>{
    transaction.add(instruction);
  })
  
  let tx = await sendTransaction(connection, wallet, transaction, signers);
  console.log("tx id->",tx);

  return "User withdrawed "+(amount / Math.pow(10, 9))+" SOL, transaction id = "+tx;
}
