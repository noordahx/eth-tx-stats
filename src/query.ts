import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';
import { writeFile } from 'fs/promises';
import path from 'path';

dotenv.config();

const DB_PATH = process.env.DB_PATH || 'transfers.db';
const OUTPUT_FILE = path.resolve(__dirname, `../${process.env.OUTPUT_FILE ?? 'transfers_db.json'}`);

interface GasStats {
    slidingAvg: number[];
    sumByDate: Record<string, string>;
    cumulativeSum: number[];
}

interface Event {
    txHash: string;
    blockNumber: string;
    from: string;
    to: string;
    amount: string;
    gasPrice: string;
    timeStamp: string;
}

interface OutputData {
    events: Event[];
    gasStats: GasStats;
}

async function getSlidingAverage(db: any): Promise<number[]> {
    // SLIDING AVG of 7 days (including starting 1-6 day averages)
    const result = await db.all(`
        WITH ordered_transfers AS (
            SELECT
                timestamp,
                gas_price,
                ROW_NUMBER() OVER (ORDER BY timestamp DESC) as row_num -- window fn to assign row #
            FROM transfers
            WHERE gas_price IS NOT NULL
            ORDER BY timestamp DESC
        )
        SELECT
            t1.timestamp,
            AVG(CAST(t2.gas_price AS NUMERIC)) as sliding_avg, -- window fn to calc avg
            COUNT(t2.gas_price) as window_size
        FROM
            ordered_transfers t1
        JOIN
            ordered_transfers t2 -- self join
            ON t2.row_num <= t1.row_num AND 
            t2.row_num > t1.row_num - 7 -- 7 day (includes starting 1-6 day avg too)
        GROUP BY
            t1.timestamp, t1.row_num
        ORDER BY
            t1.row_num;
    `);
    return result.map((row: any) => Math.round(row.sliding_avg));
}

async function getSumByDate(db: any): Promise<Record<string, string>> {
    const result = await db.all(`
        SELECT
            date(timestamp) as date,
            SUM(CAST(gas_price as numeric)) as total_gas_price
        FROM 
            transfers
        WHERE
            gas_price is not null
        group by
            date(timestamp)
        order by
            date DESC;
    `);

    return result.reduce((acc: Record<string, string>, row: any) => {
        acc[row.date] = row.total_gas_price.toString();
        return acc;
    }, {} as Record<string, string>);
}

async function getCumulativeSum(db: any): Promise<number[]> {
    const result = await db.all(`
        WITH ordered_transfers AS (
            SELECT
                timestamp,
                gas_price
            FROM 
                transfers
            WHERE
                gas_price is not null
            ORDER BY
                timestamp DESC
        )    
        SELECT
            SUM(CAST(gas_price as numeric)) OVER (
                ORDER BY timestamp DESC ROWS UNBOUNDED PRECEDING
            ) as cumulative_sum -- take sum aggregate fn, apply OVER window, ordered by timestamp decreasing and unbounded preceding (start from first row to current row)
        FROM 
            ordered_transfers;
    `);
    return result.map((row: any) => Math.round(row.cumulative_sum));
}

async function getEvents(db: any): Promise<Event[]> {
    const result = await db.all(`
        SELECT
            tx_hash as txHash,
            block_number as blockNumber,
            from_address as "from",
            to_address as "to",
            amount,
            gas_price as gasPrice,
            timestamp as timeStamp
        FROM 
            transfers
        ORDER BY 
            timeStamp DESC;
    `);
    return result.map((row: any) => ({
        txHash: row.txHash,
        blockNumber: row.blockNumber,
        from: row.from,
        to: row.to,
        amount: row.amount,
        gasPrice: row.gasPrice,
        timeStamp: row.timeStamp,
    }));
}

async function main() {
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database,
    });
    try {
        const [events, slidingAvg, sumByDate, cumulativeSum] = await Promise.all([
            getEvents(db),
            getSlidingAverage(db),
            getSumByDate(db),
            getCumulativeSum(db),
        ]);

        const outputData: OutputData = {
            events,
            gasStats: {
                slidingAvg,
                sumByDate,
                cumulativeSum,
            },
        };

        console.log(`Events: ${events.length} transactions`);
        console.log(`Sliding Averages: ${slidingAvg.length} points`);
        await writeFile(
            OUTPUT_FILE,
            JSON.stringify(outputData, null, 2)  
        );

        console.log(`Data written to ${OUTPUT_FILE}`);


    } catch (error) {
        console.error('Error processing database:', error);
    } finally {
        await db.close();
    }
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});