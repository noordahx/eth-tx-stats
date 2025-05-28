# Ethereum Tx stats

### output: transactions.json
```json
{
  "events": [
    {
      "txHash": "...",
      "blockNumber": 1234567,
      "from": "...",
      "to": "...",
      "amount": "10000000",
      "gasPrice": "500000"
    }
  ],
  "gasStats": { // in Wei
    "min": "10.0", 
    "max": "100.0",
    "avg": "45.5"
  }
}
```

### steps:

```sh
npm install
# fill .env values
npm start
```


### tech stack:

* TS
* viem (get tx data)
* ethersacn api (get a list of tx hashes)
* ts-node-dev
* dotenv