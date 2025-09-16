// sendUserOpPm.mjs
import { ethers } from "ethers";
import sdk from "@account-abstraction/sdk";
import { packUserOp } from "@account-abstraction/utils";
import { utils } from "ethers";
const { keccak256, defaultAbiCoder, arrayify} = utils;

import dotenv from "dotenv";

dotenv.config();

const {
  SimpleAccountAPI,
  HttpRpcClient,
} = sdk;

const bundlerUrl = "http://localhost:4337/rpc";
const nodeUrl = "http://localhost:8545";
const entryPointAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
const factoryAddress = "0xA15BB66138824a1c7167f5E85b957d04Dd34E468";

const bundlerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const args = process.argv.slice(2);
var senderScaAddress = "";
const senderKey = args[0]; //"0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const targetAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const valueToSend = ethers.utils.parseEther("0.1");

const paymasterAddress = "0xb19b36b1456E65E3A6D514D3F715f204BD59f431"
const signerKey = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";

const provider = new ethers.providers.JsonRpcProvider(nodeUrl);
const chainId = (await provider.getNetwork()).chainId;
const owner = new ethers.Wallet(senderKey, provider);
const bundlerClient = new HttpRpcClient(
  bundlerUrl,
  entryPointAddress,
  chainId
);  

const main = async () => {

  const accountApi = new SimpleAccountAPI({
    provider,
    entryPointAddress,
    owner,
    factoryAddress,
  });

  senderScaAddress = await accountApi.getAccountAddress();

  await getBalances();

  const rawUnsignedOp = await accountApi.createUnsignedUserOp({
    target: targetAddress,
    data: "0x",
    value: valueToSend,
  });
  rawUnsignedOp.signature = "0x";
  const unsignedOp = await resolveUserOpFields(rawUnsignedOp);

  // === PAYMASTER SIGNING LOGIC ===
  const paymasterAndData = await getPaymasterAndData(unsignedOp);
  // === END PAYMASTER SIGNING LOGIC ===

  unsignedOp.paymasterAndData = paymasterAndData;
  
  const userOp = await accountApi.signUserOp(unsignedOp);

  //console.log("UserOperation:", userOp);
  const userOpHash = await bundlerClient.sendUserOpToBundler(userOp);
  console.log("UserOperation hash:", userOpHash);

  const txHash = await accountApi.getUserOpReceipt(userOpHash);
  console.log("Transaction hash:", txHash);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (receipt) {
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice;

    const feeInWei = gasUsed.mul(gasPrice); 
    console.log("Tx Fee (ETH)", ethers.utils.formatEther(feeInWei).toString());
    console.log("========================================");
  } else {
    console.log("Transaction not mined yet.");
  }

  await getBalances();
};

async function getPaymasterAndData(unsignedOp) {
  const paymasterSigner = new ethers.Wallet(signerKey, provider);

  const unsignedUserOpHash = keccak256(
    packUserOp(unsignedOp, false) // false = forSignature (omit signature field)
  );

  const validUntil = Math.floor(Date.now() / 1000) + 3600;
  const validAfter = 0;

  const minimalPaymasterAbi = [
    "function getSenderNonce(address sender) view returns (uint256)"
  ];
  const paymasterContract = new ethers.Contract(
    paymasterAddress,
    minimalPaymasterAbi,
    provider
  );
  const senderNonce = await paymasterContract.getSenderNonce(senderScaAddress);

  const hashToSign = keccak256(
    defaultAbiCoder.encode(
      ["bytes32", "uint256", "address", "uint256", "uint48", "uint48"],
      [unsignedUserOpHash, chainId, paymasterAddress, senderNonce, validUntil, validAfter]
    )
  );
  const signature = await paymasterSigner.signMessage(arrayify(hashToSign));

  const encodedValidity = defaultAbiCoder.encode(["uint48", "uint48"], [validUntil, validAfter]);
  const paymasterAndData = paymasterAddress +
    encodedValidity.slice(2) +
    signature.slice(2); // Concatenate address + validity + signature
  
  return paymasterAndData;
}

async function resolveUserOpFields(op) {
  const entries = await Promise.all(
    Object.entries(op).map(async ([k, v]) => [k, typeof v?.then === "function" ? await v : v])
  );
  return Object.fromEntries(entries);
}

async function getBalance(name, address) {
  const balance = await provider.getBalance(address);
  const etherBalance = ethers.utils.formatEther(balance);
  console.log(`${name}(${address}): ${etherBalance} ETH`);
}

async function getBalances() {
  await getBalance("Bundler", bundlerAddress);
  await getBalance("Entrypoint", entryPointAddress);
  await getBalance("SenderSca", senderScaAddress);
  await getBalance("Paymaster", paymasterAddress);
  await getBalance("Target", targetAddress);
  console.log("========================================");
}

main().catch(console.error);
