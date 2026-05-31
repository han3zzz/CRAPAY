import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import path from "path";
import { ethers } from "ethers";
import { fileURLToPath } from "url";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = express();
app.use(cors());
app.use(express.json());
const nonces = {};

// fix __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Firebase Admin ────────────────────────────────────────────────────
if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
  });
}
const db = getFirestore(undefined, "hanzzz"); // tên database của bạn

// ── Arc / Contract config ─────────────────────────────────────────────
const ARC_RPC          = "https://rpc.testnet.arc.network";
const AGENTIC_CONTRACT = "0x0747EEf0706327138c69792bF28Cd525089e4583";
const USDC_CONTRACT    = "0x3600000000000000000000000000000000000000";

const AGENTIC_ABI = [
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
  "function complete(uint256 jobId, bytes32 reason, bytes optParams)",
  "function getJob(uint256 jobId) view returns (tuple(uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook))",
];
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

function getOperator() {
  const provider = new ethers.JsonRpcProvider(ARC_RPC);
  return new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY, provider);
}

// Parse recipient từ description: "...||to:0xABC"
function parseRecipient(description) {
  const match = description?.match(/\|\|to:(0x[0-9a-fA-F]{40})/);
  return match ? match[1] : null;
}

function nextRunTime(freq, from) {
  const d = new Date(from);
  if (freq === "daily")   d.setDate(d.getDate() + 1);
  if (freq === "weekly")  d.setDate(d.getDate() + 7);
  if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

// ── Cron: chạy mỗi phút ──────────────────────────────────────────────
async function runScheduledPayments() {
  const now = Date.now();
  console.log(`[cron] tick ${new Date(now).toISOString()}`);

  try {
    const snap = await db
      .collectionGroup("schedules")
      .where("active",    "==", true)
      .where("nextRunAt", "<=", now)
      .get();

    if (snap.empty) return;
    console.log(`[cron] ${snap.size} due schedule(s)`);

    const operator = getOperator();
    const agentic  = new ethers.Contract(AGENTIC_CONTRACT, AGENTIC_ABI, operator);
    const usdc     = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, operator);

    for (const docSnap of snap.docs) {
      const s = docSnap.data();
      if (!s.pendingJobId) {
        console.warn(`[cron] skip ${docSnap.id} — no pendingJobId`);
        continue;
      }

      try {
        const jobId = BigInt(s.pendingJobId);

        // Đọc job onchain
        const job    = await agentic.getJob(jobId);
        const status = Number(job.status);
        // 0=Open 1=Funded 2=Submitted 3=Completed 4=Rejected 5=Expired

        if (status >= 3) {
          // Terminal — reset để tạo job mới lần sau (recurring)
          await docSnap.ref.update({
            pendingJobId: null,
            lastRunAt:    now,
            nextRunAt:    s.freq !== "once" ? nextRunTime(s.freq, now) : null,
            active:       s.freq !== "once",
          });
          console.log(`[cron] skip ${docSnap.id} — terminal status ${status}`);
          continue;
        }

        // Lấy recipient từ description onchain
        const recipient = parseRecipient(job.description);
        if (!recipient || !ethers.isAddress(recipient)) {
          console.error(`[cron] invalid recipient in job #${jobId}`);
          continue;
        }

        // submit (operator là provider → được phép)
        if (status <= 1) {
          console.log(`[cron] submit job #${jobId}`);
          const deliverable = ethers.keccak256(
            ethers.toUtf8Bytes(`crapay-${s.id}-${now}`)
          );
          const tx = await agentic.submit(jobId, deliverable, "0x");
          await tx.wait();
        }

        // complete (operator là evaluator → được phép) → USDC về operator
        console.log(`[cron] complete job #${jobId}`);
        const reason = ethers.keccak256(ethers.toUtf8Bytes(`auto-${now}`));
        const completeTx = await agentic.complete(jobId, reason, "0x");
        const receipt    = await completeTx.wait();

        // transfer USDC từ operator → recipient thực sự
        const budget = job.budget;
        console.log(`[cron] transfer ${ethers.formatUnits(budget, 6)} USDC → ${recipient}`);
        const transferTx = await usdc.transfer(recipient, budget);
        await transferTx.wait();

        // Cập nhật Firebase
        const isRecurring = s.freq !== "once";
        await docSnap.ref.update({
          pendingJobId: null,
          lastRunAt:    now,
          lastTxHash:   receipt.hash,
          nextRunAt:    isRecurring ? nextRunTime(s.freq, now) : null,
          active:       isRecurring,
        });

        console.log(`[cron] ✅ ${docSnap.id} done — tx ${receipt.hash}`);

      } catch (e) {
        console.error(`[cron] ❌ ${docSnap.id}:`, e?.message ?? e);
      }
    }
  } catch (e) {
    console.error("[cron] fatal:", e?.message ?? e);
  }
}

// Start cron mỗi 60 giây
setInterval(runScheduledPayments, 60_000);
runScheduledPayments(); // chạy ngay khi server start

// SERVE STATIC FILES
app.use(express.static(path.join(__dirname, "../")));

// HOME ROUTE
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// NONCE
app.post("/nonce", (req, res) => {
  const { address } = req.body;
  const nonce = Math.floor(Math.random() * 1000000);
  nonces[address] = nonce;
  res.json({ nonce });
});

// VERIFY
app.post("/verify", async (req, res) => {
  const { address, signature } = req.body;
  const nonce = nonces[address];
  const message = `Login to CRAPAY\nNonce: ${nonce}`;
  const recovered = ethers.verifyMessage(message, signature);
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  const token = jwt.sign({ address }, process.env.JWT_SECRET || "SECRET_KEY", {
    expiresIn: "7d",
  });
  res.json({ token });
});

app.post("/sendtx", async (req, res) => {
  const { from, to, amount, symbol, message } = req.body;
  if (!from || !to || !amount || !symbol)
    return res.status(400).json({ error: "Missing fields" });
  if (!to.startsWith("0x") || !from.startsWith("0x"))
    return res.status(400).json({ error: "Invalid wallet address" });
  if (amount <= 0)
    return res.status(400).json({ error: "Amount must be > 0" });
  if (amount > 10000)
    return res.status(400).json({ error: "Amount too large" });

  const tx = { from, to, amount, symbol, message, createdAt: Date.now() };
  return res.json({ success: true, tx });
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`Server running on port ${process.env.PORT || 3001}`);
});
