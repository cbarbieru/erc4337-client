// sendUserOp.mjs
import { ethers } from "ethers";
import sdk from "@account-abstraction/sdk";
import dotenv from "dotenv";

dotenv.config();

const {
  SimpleAccountAPI,
  HttpRpcClient,
} = sdk;

const bundlerUrl = "http://localhost:4337/rpc";
const nodeUrl = "http://localhost:8545";
const entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"; 
const factoryAddress = "0x9406Cc6185a346906296840746125a0E44976454";

const bundlerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const senderEoaAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
var senderScaAddress = "";

const senderKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const targetAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const valueToSend = ethers.utils.parseEther("1.0"); // 1 ETH

const provider = new ethers.providers.JsonRpcProvider(nodeUrl);
const chainId = (await provider.getNetwork()).chainId;
const owner = new ethers.Wallet(senderKey, provider);

const main = async () => {
  const accountApi = new SimpleAccountAPI({
    provider,
    entryPointAddress,
    owner,
    factoryAddress,
  });

  senderScaAddress = await accountApi.getAccountAddress();
  console.log("Smart Account address:", senderScaAddress);

  await getBalances();

  const balance = await provider.getBalance(senderScaAddress);
  console.log("Balance:", ethers.utils.formatEther(balance));

  if (balance.lt(valueToSend)) {
    const fundTx = await owner.sendTransaction({
      to: senderScaAddress,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundTx.wait();
    console.log("Funding tx confirmed:", fundTx.hash);
  }

  const userOp = await accountApi.createSignedUserOp({
    target: targetAddress,
    data: "0x",
    value: valueToSend,
  });
  //console.log("UserOperation:", userOp);

  const bundlerClient = new HttpRpcClient(
    bundlerUrl,
    entryPointAddress,
    chainId
  );  

  const userOpHash = await bundlerClient.sendUserOpToBundler(userOp);
  console.log("UserOperation hash:", userOpHash);

  const txHash = await accountApi.getUserOpReceipt(userOpHash);
  console.log("Transaction hash:", txHash);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (receipt) {
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice; // this is a BigNumber in wei

    const feeInWei = gasUsed.mul(gasPrice); 
    console.log("Tx Fee (ETH)", ethers.utils.formatEther(feeInWei).toString());
  } else {
    console.log("Transaction not mined yet.");
  }

  await getBalances();
};

async function getBalance(name, address) {
  const balance = await provider.getBalance(address);
  const etherBalance = ethers.utils.formatEther(balance);
  console.log(`${name}(${address}): ${etherBalance} ETH`);
}

async function getBalances() {
  await getBalance("Bundler", bundlerAddress);
  await getBalance("SenderEoa", senderEoaAddress);
  await getBalance("SenderSca", senderScaAddress);
  await getBalance("Target", targetAddress);
}

main().catch(console.error);
