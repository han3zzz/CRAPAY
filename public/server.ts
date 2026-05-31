import express from "express"
import cors from "cors"
import jwt from "jsonwebtoken"
import path from "path"
import { ethers } from "ethers"
import { fileURLToPath } from "url"

const app = express()

app.use(cors())
app.use(express.json())

const nonces: Record<string, number> = {}

// fix __dirname
const __filename =
  fileURLToPath(import.meta.url)

const __dirname =
  path.dirname(__filename)

// SERVE STATIC FILES
app.use(express.static(path.join(__dirname, "../")));

// HOME ROUTE
app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "index.html"
    )
  )

})
app.get("/ping", (req, res) => {

  console.log("pingg")

})
// NONCE
app.post("/nonce", (req, res) => {

  const { address } = req.body

  const nonce =
    Math.floor(Math.random() * 1000000)

  nonces[address] = nonce

  res.json({
    nonce
  })

})

// VERIFY
app.post("/verify", async (req, res) => {

  const {
    address,
    signature
  } = req.body

  const nonce = nonces[address]

  const message =
    `Login to CRAPAY\nNonce: ${nonce}`

  const recovered =
    ethers.verifyMessage(
      message,
      signature
    )

  if (
    recovered.toLowerCase()
    !== address.toLowerCase()
  ) {

    return res.status(401).json({
      error: "Invalid signature"
    })

  }

  const token = jwt.sign(
    { address },
    "SECRET_KEY",
    {
      expiresIn: "7d"
    }
  )

  res.json({
    token
  })

})

app.post("/sendtx", async (req, res) => {
  const { from, to, amount, symbol, message } = req.body;

  // ======================
  // 1. CHECK NULL
  // ======================
  if (!from || !to || !amount || !symbol) {
    return res.status(400).json({ error: "Missing fields" });
  }

  // ======================
  // 2. CHECK ADDRESS FORMAT
  // ======================
  if (!to.startsWith("0x") || !from.startsWith("0x")) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  // ======================
  // 3. CHECK AMOUNT
  // ======================
  if (amount <= 0) {
    return res.status(400).json({ error: "Amount must be > 0" });
  }

  if (amount > 10000) {
    return res.status(400).json({ error: "Amount too large" });
  }

  // ======================
  // 4. CHECK BALANCE (fake demo)
  // ======================
  const userBalance = 1000; // giả lập

  if (amount > userBalance) {
    return res.status(400).json({ error: "Insufficient balance" });
  }

  // ======================
  // 5. CHECK DUPLICATE TX (optional)
  // ======================
  // const exists = await db.tx.findOne({ txHash })
  // if (exists) return res.status(409).json({ error: "Duplicate tx" });

  // ======================
  // 6. SAVE TX
  // ======================
  const tx = {
    from,
    to,
    amount,
    symbol,
    message,
    createdAt: Date.now(),
  };

  // await db.collection("transactions").insertOne(tx);

  return res.json({
    success: true,
    tx,
  });
});

app.listen(3001, () => {

  console.log(
    "Server running on port 3001"
  )

})
