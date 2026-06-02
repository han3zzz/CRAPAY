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

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
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

// ── Core: transferFrom USDC từ ví user sang recipient ────
// User approve relayer address (RELAYER_ADDRESS) khi tạo schedule
// Relayer gọi transferFrom → pull USDC thẳng, không qua escrow
async function runScheduleJob(sched: any, ownerAddress: string): Promise<string> {
  if (!relayerWallet) throw new Error("Relayer wallet not configured")

  const usdc = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, relayerWallet)
  const needed = ethers.parseUnits(String(sched.amount), 6)

  // Kiểm tra allowance
  const allowance: bigint = await usdc.allowance(ownerAddress, relayerWallet.address)
  if (allowance < needed) {
    throw new Error(`User has not approved relayer (allowance insufficient). Need approve for ${relayerWallet.address}`)
  }

  // transferFrom: pull USDC từ user → recipient
  const tx = await usdc.transferFrom(ownerAddress, sched.to, needed)
  await tx.wait()

  console.log(`[Scheduler] ✅ ${sched.amount} USDC ${ownerAddress.slice(0,6)}… → ${sched.to.slice(0,6)}… | tx: ${tx.hash}`)
  return tx.hash
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
    // collectionGroup — không dùng listDocuments (không support free tier)
    const schedulesSnap = await adminDb
      .collectionGroup("schedules")
      .where("active",    "==", true)
      .where("nextRunAt", "<=", now)
      .get()

    if (schedulesSnap.empty) {
      console.log("[Scheduler] No due schedules")
      return
    }

    for (const schedDoc of schedulesSnap.docs) {
      const sched = schedDoc.data()
      // Skip nếu đang chạy trong memory (tránh double-submit)
      if (jobsInProgress.has(schedDoc.id)) continue

      const ownerAddress = sched.ownerAddress as string
      // Lấy userRef từ path: users/{address}/schedules/{id}
      const userRef = schedDoc.ref.parent.parent!

      jobsInProgress.add(schedDoc.id)

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

        // Lưu vào users/{address}/history để frontend load được
        const historyId = String(ts)
        await userRef.collection("history").doc(historyId).set({
          id:           historyId,
          hash:         txHash,
          from:         ownerAddress,
          to:           sched.to,
          amount:       sched.amount,
          token:        sched.token ?? "USDC",
          type:         "sent",
          msg:          sched.msg ? `${sched.msg} — Scheduled` : `Scheduled ${sched.freq ?? "once"} payment`,
          ts,
          ownerAddress,
          updatedAt:    ts,
        })

        // Đồng thời lưu vào top-level transactions để xem tổng quan
        await adminDb.collection("transactions").add({
          hash:         txHash,
          from:         ownerAddress,
          to:           sched.to,
          amount:       sched.amount,
          token:        sched.token ?? "USDC",
          type:         "sent",
          msg:          sched.msg ? `${sched.msg} — Scheduled` : `Scheduled ${sched.freq ?? "once"} payment`,
          ts,
          ownerAddress,
          createdAt:    ts,
        })

        // Lưu notification
        await userRef.collection("notifications").add({
          text: `⚡ Scheduled: sent ${sched.amount} ${sched.token ?? "USDC"} to ${String(sched.to).slice(0,6)}…${String(sched.to).slice(-4)}`,
          time: ts,
          read: false,
          ownerAddress,
        })

        jobsInProgress.delete(schedDoc.id)
        console.log("[Scheduler] ✅ " + schedDoc.id + " done")
      } catch (err: any) {
        jobsInProgress.delete(schedDoc.id)
        console.error("[Scheduler] ❌ " + schedDoc.id + ":", err.message)
        await schedDoc.ref.update({
          _lastError: err.message,
          updatedAt:  Date.now(),
        })
      }
    }
  } catch (err: any) {
    console.error("[Scheduler] Query error:", err.message)
  }
}

// Track jobs đang chạy trong memory để tránh double-submit
const jobsInProgress = new Set<string>()

setInterval(checkAndRunSchedules, 120_000)
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

// Frontend gọi endpoint này để lấy relayer address
app.get("/config", (req, res) => {
  res.json({
    relayerAddress: relayerWallet?.address ?? null,
  })
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
