import express from "express"
import cors from "cors"
import jwt from "jsonwebtoken"
import path from "path"
import { ethers } from "ethers"
import { fileURLToPath } from "url"
import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

// ── Firebase Admin ─────────────────────────────────────────
initializeApp({
  credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
})
const adminDb = getFirestore("hanzzz")

// ── Arc / Agentic constants ────────────────────────────────
const ARC_RPC          = "https://rpc.testnet.arc.network"
const AGENTIC_CONTRACT = "0x0747EEf0706327138c69792bF28Cd525089e4583"
const USDC_CONTRACT    = "0x3600000000000000000000000000000000000000"

const AGENTIC_ABI = [
  "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256 jobId)",
  "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
  "function fund(uint256 jobId, bytes optParams)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
  "function complete(uint256 jobId, bytes32 reason, bytes optParams)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
]

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
]

// ── Relayer wallet ─────────────────────────────────────────
// Thêm RELAYER_PRIVATE_KEY vào .env
// Ví này chỉ cần đủ native token trả gas, không cần giữ USDC
const rpcProvider   = new ethers.JsonRpcProvider(ARC_RPC)
const relayerWallet = process.env.RELAYER_PRIVATE_KEY
  ? new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, rpcProvider)
  : null

if (relayerWallet) {
  console.log("[Relayer] Address:", relayerWallet.address)
} else {
  console.warn("[Relayer] RELAYER_PRIVATE_KEY not set — scheduler disabled")
}

// ── Helper: extract jobId từ receipt ──────────────────────
async function extractJobId(txHash: string): Promise<bigint> {
  const receipt = await rpcProvider.getTransactionReceipt(txHash)
  if (!receipt) throw new Error("Receipt not found: " + txHash)
  const iface = new ethers.Interface(AGENTIC_ABI)
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data })
      if (parsed?.name === "JobCreated") return parsed.args.jobId as bigint
    } catch { continue }
  }
  throw new Error("JobCreated event not found in tx: " + txHash)
}

// ── Core: chạy full agentic lifecycle cho 1 schedule ──────
// Relayer là evaluator — tự gọi complete() sau khi fund xong
// USDC được pull từ ví user thông qua allowance đã approve trước
async function runScheduleJob(sched: any, ownerAddress: string): Promise<string> {
  if (!relayerWallet) throw new Error("Relayer wallet not configured")

  const agentic = new ethers.Contract(AGENTIC_CONTRACT, AGENTIC_ABI, relayerWallet)
  const usdc    = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, rpcProvider)

  // Kiểm tra user đã approve chưa
  const allowance: bigint = await usdc.allowance(ownerAddress, AGENTIC_CONTRACT)
  const needed = ethers.parseUnits(String(sched.amount), 6)
  if (allowance < needed) {
    throw new Error(`User has not approved AgenticCommerce (allowance insufficient)`)
  }

  const block = await rpcProvider.getBlock("latest")
  if (!block) throw new Error("Cannot fetch latest block")
  const expiredAt = BigInt(block.timestamp) + BigInt(86400)

  const description = sched.msg
    ? `${sched.msg} — Scheduled`
    : `Scheduled payment via CRAPAY`

  // Step 1: createJob
  // client = ownerAddress (user), provider = recipient, evaluator = relayer
  const createTx = await agentic.createJob(
    sched.to,               // provider = người nhận tiền
    relayerWallet.address,  // evaluator = relayer (sẽ tự gọi complete)
    expiredAt,
    description,
    "0x0000000000000000000000000000000000000000"
  )
  await createTx.wait()
  const jobId = await extractJobId(createTx.hash)
  console.log(`[Scheduler] Job #${jobId} created`)

  // Step 2: setBudget
  await (await agentic.setBudget(jobId, needed, "0x")).wait()

  // Step 3: fund — contract pull USDC từ ví user (nhờ allowance)
  await (await agentic.fund(jobId, "0x")).wait()

  // Step 4: submit deliverable
  const deliverable = ethers.keccak256(
    ethers.toUtf8Bytes(`crapay-${jobId}-${description}-${Date.now()}`)
  )
  await (await agentic.submit(jobId, deliverable, "0x")).wait()

  // Step 5: complete → USDC released to provider (recipient)
  const reason = ethers.keccak256(ethers.toUtf8Bytes(`approved-${Date.now()}`))
  const completeTx = await agentic.complete(jobId, reason, "0x")
  await completeTx.wait()

  console.log(`[Scheduler] ✅ Job #${jobId} | ${sched.amount} USDC → ${sched.to} | tx: ${completeTx.hash}`)
  return completeTx.hash
}

// ── nextRunTime ────────────────────────────────────────────
function nextRunTime(freq: string, from: number): number {
  const d = new Date(from)
  if (freq === "daily")   d.setDate(d.getDate() + 1)
  if (freq === "weekly")  d.setDate(d.getDate() + 7)
  if (freq === "monthly") d.setMonth(d.getMonth() + 1)
  return d.getTime()
}

// ── Cron: check + run due schedules mỗi 60 giây ───────────
async function checkAndRunSchedules(): Promise<void> {
  if (!relayerWallet) return
  const now = Date.now()
  console.log("[Scheduler] Checking due schedules…")

  try {
    const usersSnap = await adminDb.collection("users").listDocuments()

    for (const userRef of usersSnap) {
      const schedulesSnap = await adminDb
        .collection("users").doc(userRef.id)
        .collection("schedules")
        .where("active",    "==", true)
        .where("nextRunAt", "<=", now)
        .get()

      if (schedulesSnap.empty) continue

      for (const schedDoc of schedulesSnap.docs) {
        const sched = schedDoc.data()

        // Bỏ qua nếu đang có job khác chạy (tránh double-run)
        if (sched._running) continue

        const ownerAddress = sched.ownerAddress as string
        await schedDoc.ref.update({ _running: true, _runStartedAt: now })

        try {
          const txHash = await runScheduleJob(sched, ownerAddress)
          const ts = Date.now()
          const isOnce = sched.freq === "once"

          await schedDoc.ref.update({
            lastRunAt:  ts,
            lastTxHash: txHash,
            active:     !isOnce,
            nextRunAt:  isOnce ? sched.nextRunAt : nextRunTime(sched.freq, ts),
            _running:   false,
            updatedAt:  ts,
          })

          // Push notification cho user
          await adminDb
            .collection("users").doc(userRef.id)
            .collection("notifications")
            .add({
              text: `⚡ Scheduled: sent ${sched.amount} ${sched.token ?? "USDC"} to ${String(sched.to).slice(0,6)}…${String(sched.to).slice(-4)}`,
              time: ts,
              read: false,
              ownerAddress,
            })
        } catch (err: any) {
          console.error(`[Scheduler] ❌ ${schedDoc.id}:`, err.message)
          await schedDoc.ref.update({
            _running:   false,
            _lastError: err.message,
            updatedAt:  Date.now(),
          })
        }
      }
    }
  } catch (err: any) {
    console.error("[Scheduler] Query error:", err.message)
  }
}

setInterval(checkAndRunSchedules, 60_000)
checkAndRunSchedules()

// ══════════════════════════════════════════════════════════
// Express app (giữ nguyên code cũ bên dưới)
// ══════════════════════════════════════════════════════════

const app = express()

app.use(cors())
app.use(express.json())

const nonces: Record<string, number> = {}

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

app.use(express.static(path.join(__dirname, "../")))

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"))
})

app.get("/ping", (req, res) => {
  console.log("pingg")
})

app.post("/nonce", (req, res) => {
  const { address } = req.body
  const nonce = Math.floor(Math.random() * 1000000)
  nonces[address] = nonce
  res.json({ nonce })
})

app.post("/verify", async (req, res) => {
  const { address, signature } = req.body
  const nonce = nonces[address]
  const message = `Login to CRAPAY\nNonce: ${nonce}`
  const recovered = ethers.verifyMessage(message, signature)
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return res.status(401).json({ error: "Invalid signature" })
  }
  const token = jwt.sign({ address }, "SECRET_KEY", { expiresIn: "7d" })
  res.json({ token })
})

app.post("/sendtx", async (req, res) => {
  const { from, to, amount, symbol, message } = req.body

  if (!from || !to || !amount || !symbol) {
    return res.status(400).json({ error: "Missing fields" })
  }
  if (!to.startsWith("0x") || !from.startsWith("0x")) {
    return res.status(400).json({ error: "Invalid wallet address" })
  }
  if (amount <= 0) {
    return res.status(400).json({ error: "Amount must be > 0" })
  }
  if (amount > 10000) {
    return res.status(400).json({ error: "Amount too large" })
  }

  const userBalance = 1000
  if (amount > userBalance) {
    return res.status(400).json({ error: "Insufficient balance" })
  }

  const tx = { from, to, amount, symbol, message, createdAt: Date.now() }
  return res.json({ success: true, tx })
})

app.listen(3001, () => {
  console.log("Server running on port 3001")
})
