# Ethereum Tx stats

### output: transactions.json
```json
{
  "events": [
    {
      "txHash": "0xbfa474c5e2a7176b4f97858237a7b027a088fba535717817791f778fe4ec31ce",
      "blockNumber": "22599790",
      "from": "0x663DC15D3C1aC63ff12E45Ab68FeA3F0a883C251",
      "to": "0xeF4fB24aD0916217251F553c0596F8Edc630EB66",
      "amount": "24038675",
      "gasPrice": "1015508678",
      "timeStamp": "2025-05-31T02:40:47.000Z"
    },
    ...
  ],
  "gasStats": {
    "slidingAvg": [
      1015508678,
      ...
    ],
    "sumByDate": {
      "2025-05-31": "325745576977"
    },
    "cumulativeSum": [
      312906730226,
      ...
    ]
  }
}
```

### steps:

```sh
npm install
# write .env values
# fill database with data
npm run fill
# export to json format with additional gasStats query results
npm run export
```


### tech stack:

* TS
* viem
* ts-node-dev
* dotenv
* sqlite