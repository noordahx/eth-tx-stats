import { createPublicClient, http, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';
import dotenv from 'dotenv';
import { writeFile } from 'fs/promises';
import Bottleneck from 'bottleneck';

dotenv.config();

const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS as `0x${string}`;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as `0x${string}`;
const NUMBER_OF_TRANSACTIONS = Number(process.env.NUMBER_OF_TRANSACTIONS);
const ETH_RPC_URL = process.env.ETH_RPC_URL;

const OUTPUT_FILE = 'transfers';
const ABI = 'event Transfer(address indexed from, address indexed to, uint256 value)';
const BLOCK_STEP = 20n;
const BATCH_SIZE = 5;

if (!ACCOUNT_ADDRESS || !TOKEN_ADDRESS || !NUMBER_OF_TRANSACTIONS || !ETH_RPC_URL) {
	console.error('fill in the .env file with ACCOUNT_ADDRESS, TOKEN_ADDRESS, NUMBER_OF_TRANSACTIONS, and ETH_RPC_URL.');
	process.exit(1);
}

const limiter = new Bottleneck({
	minTime: 400,
	maxConcurrent: 1,
});

const client = createPublicClient({
	chain: mainnet,
	transport: http(ETH_RPC_URL),
})

async function fetchEvents(startBlock: bigint, endBlock: bigint) {
	const logs = await limiter.schedule(() =>
		client.getLogs({
			address: TOKEN_ADDRESS,
			fromBlock: startBlock,
			toBlock: endBlock,
			event: parseAbiItem(ABI)
		})
	);

	return logs.filter((logs) =>
		logs.args.from?.toLowerCase() === ACCOUNT_ADDRESS.toLowerCase() ||
		logs.args.to?.toLowerCase() === ACCOUNT_ADDRESS.toLowerCase()
	);
}



function deduplicateByTxHash(events: any[]) {
  const unique = new Map<string, any>();
  for (const event of events) {
    unique.set(event.transactionHash, event);
  }
  return Array.from(unique.values());
}


function calculateGasStats(events: any[]) {
	const cumulativeSum: number[] = [];
	let runningTotal = 0n;

	for (const event of events) {
		const gasValue = BigInt(event.gasPrice.toString());
		runningTotal += gasValue;
		cumulativeSum.push(Number(runningTotal));
	}

	const sumByDate: Record<string, string> = {};

	for (const event of events) {
		const date = event.date;
		const gasValue = BigInt(event.gasPrice.toString());
		
		if (!sumByDate[date]) {
		sumByDate[date] = '0';
		}
		sumByDate[date] = (BigInt(sumByDate[date]) + gasValue).toString();
	}

	const slidingAvg: number[] = [];

	for (let i = 0; i < events.length; i++) {
		const event = events[i];
		const eventTime = new Date(event.timeStamp).getTime();
		const sevenDaysAgo = eventTime - (7 * 24 * 60 * 60 * 1000);
		
		const lastWeekEvents = events.filter(e => 
		new Date(e.timeStamp).getTime() >= sevenDaysAgo && 
		new Date(e.timeStamp).getTime() <= eventTime
		);
		
		if (lastWeekEvents.length > 0) {
			const sum = lastWeekEvents.reduce((acc, e) => 
				acc + Number(e.gasPrice.toString()), 0
			);
			slidingAvg.push(parseFloat((sum / lastWeekEvents.length).toFixed(2)));
		}
	}
	return {
		slidingAvg,
		sumByDate,
		cumulativeSum
	};
}

async function fetchAllEventsParallel(latestBlock: bigint, maxEvents: number) {
	const events: any[] = [];
	const ranges: Array<[bigint, bigint]> = [];

	let toBlock = latestBlock;
	while (toBlock > 0n) {
		const fromBlock = toBlock > BLOCK_STEP ? toBlock - BLOCK_STEP : 0n;
		ranges.push([fromBlock, toBlock]);
		if (fromBlock === 0n) break;
		toBlock = fromBlock - 1n;
	}

	for (let i = 0; i < ranges.length; i += BATCH_SIZE) {
		const batch = ranges.slice(i, i + BATCH_SIZE);
		console.log(`Fetching batch ${i / BATCH_SIZE + 1} of ${Math.ceil(ranges.length / BATCH_SIZE)}...`);

		const results = await Promise.allSettled(
			batch.map(async ([fromBlock, toBlock]) => {
				console.log(`	Fetching from block ${fromBlock} to ${toBlock}`);
				const chunk = await fetchEvents(fromBlock, toBlock);
				return chunk;
			})
		);

		for (const result of results) {
			if (result.status === 'fulfilled') {
				events.push(...result.value);
			} else {
				console.warn('Failed to fetch a range:', result.reason);
			}

			if (deduplicateByTxHash(events).length >= maxEvents) {
				console.log(`Collected enough unique events: ${deduplicateByTxHash(events).length}`);
				return deduplicateByTxHash(events);
			}
		}
	}

	return deduplicateByTxHash(events);
}

async function main() {
	const latestBlock = await client.getBlockNumber();

	const events = await fetchAllEventsParallel(latestBlock, NUMBER_OF_TRANSACTIONS);

	const enriched: any[] = [];

	for (let i = 0; i < events.length; i += BATCH_SIZE) {
	const batch = events.slice(i, i + BATCH_SIZE);

	console.log(`Fetch gas price for batch ${i / BATCH_SIZE + 1} of ${Math.ceil(events.length / BATCH_SIZE)}...`);

	const results = await Promise.allSettled(
		batch.map(async (e) => {
			const [gasPrice, blockTimestamp] = await Promise.all([
				(await client.getTransaction({ hash: e.transactionHash })).gasPrice ?? null,
				(await client.getBlock({ blockNumber: e.blockNumber })).timestamp,
			]);

			return {
				txHash: e.transactionHash,
				blockNumber: e.blockNumber,
				from: e.args.from,
				to: e.args.to,
				amount: e.args.value.toString(),
				gasPrice: gasPrice,
				timeStamp: new Date(Number(blockTimestamp) * 1000).toISOString(),
				date: new Date(Number(blockTimestamp) * 1000).toISOString().split('T')[0],
			};
		})
	);

	for (const result of results) {
		if (result.status === 'fulfilled') {
		enriched.push(result.value);
		}
	}
	}

	const sortedEvents = enriched
		.filter(e => e.gasPrice !== null)
		.sort((a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime());

	const gasStats = calculateGasStats(sortedEvents);

	const finalOutput = {
		events: sortedEvents.map(({ date, ...rest }) => rest),
		gasStats
	}

	const safeStringify = (obj: any) => JSON.stringify(obj, (_, val) => (typeof val === 'bigint' ? val.toString() : val), 2);

	await writeFile(`${OUTPUT_FILE}.json`, safeStringify(finalOutput));
	console.log(`Transfers saved to ${OUTPUT_FILE}.json`);
}

main().catch(console.error);