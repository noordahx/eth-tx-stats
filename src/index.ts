import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import axios from 'axios';
import dotenv from 'dotenv';
import { writeFile } from 'fs/promises';
dotenv.config();

const apiKey = process.env.ETHERSCAN_API_KEY;
const address = process.env.ACCOUNT_ADDRESS;
const tokenAddress = process.env.TOKEN_ADDRESS;
const numberOfTransactions = process.env.NUMBER_OF_TRANSACTIONS ? parseInt(process.env.NUMBER_OF_TRANSACTIONS) : 300;

if (!apiKey || !address || !tokenAddress) {
	console.error('Fill .env');
	process.exit(1);
}

const client = createPublicClient({
	chain: mainnet,
	transport: http(),
})

async function fetchTransfers(): Promise<any[]> {
	const url = `https://api.etherscan.io/api
		?module=account
		&action=tokentx
		&address=${address}
		&contractaddress=${tokenAddress}
		&page=1
		&offset=${numberOfTransactions.toString()}
		&sort=desc
		&apikey=${apiKey}`.replace(/\s+/g, '');
	try {
		const res = await axios.get(url);
    	if (res.data.status !== '1') throw new Error('Etherscan error: ' + res.data.message);	
		console.log(`fetchTransfers: Fetched ${res.data.result.length} transfers for address ${address}`);
		return res.data.result;
	} catch (error) {
		console.error('fetchTransfers: Error fetching transfers:', error);
		return [];
	}
}

async function getTxGasPrice(txHash: `0x${string}`): Promise<bigint | null> {
  try {
    const tx = await client.getTransaction({ hash: txHash });
    return tx.gasPrice ?? null;
  } catch (err) {
    console.warn(`getTxGasPrice: Failed to fetch gasPrice for ${txHash}:`, err);
    return null;
  }
}

async function main() {
	const rawEvents = await fetchTransfers();
	const events = await Promise.all(rawEvents.map(async (e) => {
		const txHash = e.hash as `0x${string}`;
		const gasPrice = await getTxGasPrice(txHash);
		return {
			txHash,
			blockNumber: e.blockNumber,
			from: e.from,
			to: e.to,
			amount: e.value,
			gasPrice: gasPrice?.toString() ?? null,
		};
	}));

	const validEvents = events.filter(e => e.gasPrice !== null);
	const gasPricesWei = validEvents.map(e => BigInt(e.gasPrice!));

	const maxGas = gasPricesWei.reduce((max, price) => price > max ? price : max, 0n);
	const minGas = gasPricesWei.reduce((min, price) => price < min ? price : min, maxGas);
	const avgGas = gasPricesWei.reduce((sum, price) => sum + price, 0n) / BigInt(gasPricesWei.length);


	const gasStats = {
		min: minGas.toString(),
		max: maxGas.toString(),
		avg: avgGas.toString(),
	}

	const output = {
		events: validEvents,
		gasStats,
	}

	await writeFile('transfers.json', JSON.stringify(output, null, 2));
	console.log('Transfers saved to transfers.json');
}


main().catch(console.error);