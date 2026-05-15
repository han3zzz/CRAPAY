import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { EIP1193Provider } from "viem";
import { initializeApp } from "firebase/app";
import dotenv from "dotenv";
import { createWalletClient, custom } from "viem";
declare const Swal: any;

import { getFirestore } from "firebase/firestore";
import {
  onSnapshot,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  updateDoc,
  doc
} from "firebase/firestore";
const kit = new AppKit();



// ===================== TYPES =====================
declare global {
  interface Window {
    ethereum?: any;
  }
}

// ===================== MENU NAV =====================
const menuBtns = document.querySelectorAll<HTMLButtonElement>(".menu-btn");
const pages = document.querySelectorAll<HTMLElement>(".page");
function isLoggedIn(): boolean {
  return !!localStorage.getItem("wallet");
}
(window as any).isLoggedIn = isLoggedIn;
async function showPage(page: string): Promise<void> {
  const loggedIn = isLoggedIn();

  pages.forEach(p => p.classList.remove("active-page"));

  if (page === "home") {
    document.getElementById("homePage")?.classList.add("active-page");
    return;
  }

  if (!loggedIn) {
    Swal.fire({
      title: "You need to login first!",
      icon: "warning"
    });

    document.getElementById("homePage")?.classList.add("active-page");
    return;
  }

  // ======================
  // LOGGED IN AREA
  // ======================

  if (page === "send") {
    document.getElementById("sendPage")?.classList.add("active-page");
  }

  if (page === "qrpay") {
    document.getElementById("qrpayPage")?.classList.add("active-page");
  }

  if (page === "scanqr") {
    document.getElementById("scanqrPage")?.classList.add("active-page");
    imageBtn.click();
  }

  if (page === "comfirm") {
    document.getElementById("comfirmPage")?.classList.add("active-page");
  }

  if (page === "success") {
    document.getElementById("successPage")?.classList.add("active-page");
  }

  if (page === "infotran") {
    document.getElementById("infotranPage")?.classList.add("active-page");
  }

  if (page === "swap") {
    document.getElementById("swapPage")?.classList.add("active-page");
    const address = localStorage.getItem("wallet");

if (!address) {
  console.log("No wallet");
  return;
}

 const balance = await getTokenBalances(address);

  const usdc = document.getElementById("usdcswap")
  const eurc = document.getElementById("eurcswap")

  if (usdc) usdc.innerText = "Balance : " + balance.USDC + " USDC"
  if (eurc) eurc.innerText = "Balance : " + balance.EURC + " EURC"
  }
  if (page === "transactions") {
    document.getElementById("tranhistoryPage")?.classList.add("active-page");
    loadAllTransactions();
  }

}

menuBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const page = btn.dataset.page as string;

    // ⚡ CHẶN NGAY TỪ MENU
    if (!isLoggedIn() && page !== "home") {
      Swal.fire({
        title: "Please login first",
        icon: "warning"
      });
      return;
    }

    menuBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    reset();
    showPage(page);
  });
});
function reset(): void {

  const inputs = document.querySelectorAll<HTMLInputElement>("input");

  inputs.forEach(input => {
    input.value = "";
  });
 
  const textareas =
    document.querySelectorAll<HTMLTextAreaElement>("textarea");

  textareas.forEach(textarea => {
    textarea.value = "";
  });
  stopCamera();
}
(window as any).reset = reset;
// DEFAULT HOME
window.addEventListener("DOMContentLoaded", () => {
  showPage("home");
});

// ===================== TOKEN SELECT =====================

const tokens = document.querySelectorAll<HTMLElement>(".token");

let selectedToken: string = "USDC";

tokens.forEach(t => {
  t.addEventListener("click", () => {

    const token = t.dataset.token || "USDC";

    // ===== EURC chưa hỗ trợ =====
    if (token === "EURC") {

      Swal.fire({
        icon: "warning",
        title: "EURC is temporarily unsupported.",
        confirmButtonColor: "#8B5CF6"
      });

      // reset về USDC
      tokens.forEach(x => x.classList.remove("active"));

      const usdcToken = document.querySelector<HTMLElement>(
        '.token[data-token="USDC"]'
      );

      usdcToken?.classList.add("active");

      selectedToken = "USDC";

      return;
    }

    // ===== USDC =====
    tokens.forEach(x => x.classList.remove("active"));

    t.classList.add("active");

    selectedToken = token;

    console.log("Selected:", selectedToken);

  });
});

// ===================== QR GENERATE =====================
function generateQR(): void {
  const symbol =
    document.querySelector<HTMLElement>(".token.active")?.dataset.token || "USDC";

  const address = (document.getElementById("qraddess") as HTMLInputElement).value;
  const amount = (document.getElementById("qrnumber") as HTMLInputElement).value;
  const message = (document.getElementById("qrmessage") as HTMLTextAreaElement).value;

  const data = `CRAPAY|${symbol}|${address}|${amount}|${message}`;

  const canvas = document.createElement("canvas");

  (window as any).QRCode.toCanvas(canvas, data, {
    width: 260,
    color: { dark: "#000000", light: "#ffffff" },
    margin: 2,
  }, function (error: any) {
    if (error) return console.error(error);

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.src = "./public/logo.png";

    logo.onload = function () {
      const size = 31;
      const x = (canvas.width - size) / 2;
      const y = (canvas.height - size) / 2;

      ctx.fillStyle = "#121212";
      (ctx as any).roundRect(x - 6, y - 6, size + 12, size + 12, 8);
      ctx.fill();

      ctx.drawImage(logo, x, y, size, size);

      const imgData = canvas.toDataURL("image/png");

      (window as any).Swal.fire({
        title: "My QR Payment",
        background: "#121212",
        color: "#fff",
        html: `
          <div style="display:flex;justify-content:center;">
            <img src="${imgData}" style="width:260px;height:260px;border-radius:12px;" />
          </div>
        `,
        showConfirmButton: false, 

  footer: `
    <div style="display:flex;gap:10px;justify-content:center;width:100%;">
      <button id="closeBtn" style="
        background:linear-gradient(
        135deg,
        #6739B7,
        #9A7EC9
      );
        color:#fff;
        border:none;
        padding:8px 14px;
        border-radius:8px;
        cursor:pointer;
      ">Close</button>

      <button id="downloadBtn" style="
        background:linear-gradient(
        135deg,
        #6739B7,
        #9A7EC9
      );
        color:#fff;
        border:none;
        padding:8px 14px;
        border-radius:8px;
        cursor:pointer;
        font-weight:600;
      "><i class="fa-solid fa-download"></i> Download QR</button>
    </div>
  `,
        didOpen: () => {
          (document.getElementById("closeBtn") as HTMLButtonElement).onclick = () =>
            (window as any).Swal.close();

          (document.getElementById("downloadBtn") as HTMLButtonElement).onclick = () => {
            const a = document.createElement("a");
            a.href = imgData;
            a.download = "CRAPAY-QR.png";
            a.click();
          };
        }
      });
    };
  });
}

// expose ra HTML
(window as any).generateQR = generateQR;

// ===================== ZXING =====================
const codeReader = new (window as any).ZXing.BrowserMultiFormatReader();
let isCameraRunning = false;

const cameraBtn = document.getElementById("scanCamera") as HTMLDivElement;
const imageBtn = document.getElementById("scanImage") as HTMLDivElement;

const cameraBox = document.getElementById("cameraBox") as HTMLDivElement;
const imageBox = document.getElementById("imageBox") as HTMLDivElement;

function setActive(el: HTMLElement): void {
  document.querySelectorAll(".scan-option").forEach(x =>
    x.classList.remove("active")
  );
  el.classList.add("active");
}

function stopCamera(): void {
  try {
    codeReader.reset();
  } catch {}

  isCameraRunning = false;
}

// CAMERA
cameraBtn.onclick = async () => {
  setActive(cameraBtn);

  imageBox.style.display = "none";
  cameraBox.style.display = "block";

  stopCamera();

  try {
    const video = document.createElement("video");

    const reader = document.getElementById("reader") as HTMLDivElement;
    reader.innerHTML = "";
    reader.appendChild(video);

    const devices = await codeReader.listVideoInputDevices();
    const deviceId = devices?.[0]?.deviceId;

    await codeReader.decodeFromVideoDevice(
      deviceId,
      video,
      (result: any) => {
        if (result) {
          handleQRResult(result.text);
          stopCamera();
        }
      }
    );

    isCameraRunning = true;
  } catch (err) {
    console.log(err);
  }
};

// IMAGE
imageBtn.onclick = () => {
  setActive(imageBtn);

  cameraBox.style.display = "none";
  imageBox.style.display = "block";

  stopCamera();
};

// FILE SCAN
document.getElementById("qrFile")?.addEventListener("change", async (e: any) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);

  try {
    const result = await codeReader.decodeFromImageUrl(url);
    handleQRResult(result.text);
  } catch (err) {
    console.log(err);
  }
});

// DEFAULT
window.addEventListener("DOMContentLoaded", () => {
  setActive(imageBtn);
  stopCamera();
});

// ===================== QR HANDLE =====================
function handleQRResult(decodedText: string): void {
  if (decodedText.startsWith("CRAPAY|")) {
    const [_, symbol, address, amount, message] = decodedText.split("|");

    (document.getElementById("qraddess") as HTMLInputElement).value = address;
    (document.getElementById("qrnumber") as HTMLInputElement).value = amount;
    (document.getElementById("qrmessage") as HTMLTextAreaElement).value = message;

    showComfirmPage(symbol, amount, address, message);
  }
}



// ===================== EXPORT (optional) =====================
export {};




const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
]

const TOKENS = [
  {
    name: "USDC",
    address: "0x3600000000000000000000000000000000000000"
  },
  {
    name: "EURC",
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"
  }
]

// =====================
// TYPES
// =====================

type Token = {
  name: string
  address: string
}

type TokenBalanceResult = {
  [key: string]: string
}

declare global {
  interface Window {
    ethereum?: any
    ethers?: any
  }
}

// =====================
// DOM ELEMENTS
// =====================

const loginBtn = document.getElementById("loginBtn") as HTMLButtonElement | null
const walletBtn = document.getElementById("walletBtn") as HTMLButtonElement | null

// =====================
// STATE
// =====================

let currentAccount: string | null = null

// =====================
// LOGIN
// =====================

async function login(): Promise<void> {

  if (!window.ethereum) {
    Swal.fire({
  title: "Please install MetaMask",
  icon: "error"
});
    return
  }

  try {

    await switchToArcTestnet()

    const accounts: string[] = await window.ethereum.request({
      method: "eth_requestAccounts"
    })

    if (!accounts.length) return

    const address: string = accounts[0]

    const nonceRes = await fetch("http://localhost:3001/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address })
    })

    const nonceData: { nonce: string } = await nonceRes.json()

    const message: string = `Login to CRAPAY\nNonce: ${nonceData.nonce}`

    const signature: string = await window.ethereum.request({
      method: "personal_sign",
      params: [message, address]
    })

    const verifyRes = await fetch("http://localhost:3001/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature })
    })

    const data: { token?: string } = await verifyRes.json()

    if (!data.token) return
      Swal.fire({
  title: "Login Success !",
  icon: "success"
});
    localStorage.setItem("token", data.token)
    localStorage.setItem("wallet", address)

    updateWalletUI(address)
    getBalance(address)

  } catch (error) {
    console.log(error)
     Swal.fire({
  title: "Wallet login failed",
  icon: "warning"
});
  }
}

// =====================
// LOGOUT
// =====================

function logout(): void {
  currentAccount = null;

  localStorage.removeItem("token");
  localStorage.removeItem("wallet");

  Swal.fire({
    title: "Logout Success !",
    icon: "success"
  });

  if (loginBtn) loginBtn.style.display = "inline-flex";
  if (walletBtn) walletBtn.style.display = "none";

  // 👉 RESET MENU ACTIVE
  menuBtns.forEach(b => b.classList.remove("active"));

  // 👉 CHUYỂN VỀ HOME
  showPage("home");

  // 👉 set lại active cho home button (nếu có)
  const homeBtn = document.querySelector('[data-page="home"]');
  homeBtn?.classList.add("active");
}

// =====================
// UI UPDATE
// =====================

function updateWalletUI(address: string): void {

  currentAccount = address

  const shortAddress =
    address.slice(0, 6) + "..." + address.slice(-4)

  if (walletBtn) walletBtn.innerHTML = shortAddress + ` <span style="padding-left:5px"><i class="fa-solid fa-arrow-right-from-bracket"></i></span>`
  if (loginBtn) loginBtn.style.display = "none"
  if (walletBtn) walletBtn.style.display = "inline-flex"

}

// =====================
// CHECK LOGIN
// =====================

function checkLogin(): void {

  const wallet = localStorage.getItem("wallet")
  const token = localStorage.getItem("token")

  if (!wallet || !token) return

  updateWalletUI(wallet)
  getBalance(wallet)
}

// =====================
// META MASK EVENTS
// =====================

if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts: string[]) => {

    if (!accounts.length) {
      logout()
      return
    }

    const address = accounts[0]

    localStorage.setItem("wallet", address)
    updateWalletUI(address)
  })
}

// =====================
// EVENTS
// =====================

loginBtn?.addEventListener("click", login)

walletBtn?.addEventListener("click", () => {
    Swal.fire({
  title: "You comfirm want logout ?",
  icon: "question",
  showCancelButton: true,
  confirmButtonText: "Logout",
  cancelButtonText: "Cancel",
  confirmButtonColor: "#8B5CF6",
}).then((res : any) => {
  if (!res.isConfirmed) return;

  logout()

    const usdc = document.getElementById("balanceusdc")
    const eurc = document.getElementById("balanceeurc")
    const totaltran = document.getElementById("totalTrans")

    if (usdc) usdc.innerText = "0"
    if (eurc) eurc.innerText = "0"
    if (totaltran) totaltran.innerText = "0"
});
 
})

// =====================
// AUTO LOGIN
// =====================

checkLogin()

// =====================
// SWITCH NETWORK
// =====================

async function switchToArcTestnet(): Promise<void> {

  const chainId = "0x4cef52"

  try {

    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }]
    })

  } catch (error: any) {

    if (error.code === 4902) {

      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId,
            chainName: "Arc Testnet",
            nativeCurrency: {
              name: "USDC",
              symbol: "USDC",
              decimals: 18
            },
            rpcUrls: ["https://rpc.testnet.arc.network"],
            blockExplorerUrls: ["https://testnet.arcscan.app"]
          }]
        })

      } catch (addError) {
        console.log(addError)
      }

    } else {
      console.log(error)
    }
  }
}

// =====================
// BALANCE
// =====================

async function getBalance(address: string): Promise<TokenBalanceResult> {

  const balance = await getTokenBalances(address)

  const usdc = document.getElementById("balanceusdc")
  const eurc = document.getElementById("balanceeurc")
  const totalTrans = document.getElementById("totalTrans")

  if (usdc) usdc.innerText = balance.USDC
  if (eurc) eurc.innerText = balance.EURC
  let allTxs = [];
  const q = query(
      collection(db, "transactions"),
      where("participants", "array-contains", wallet),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    allTxs = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    if (totalTrans) totalTrans.innerText = snap.size.toString();

  return balance
}

async function getTokenBalances(userAddress: string): Promise<TokenBalanceResult> {

  const provider = new window.ethers.BrowserProvider(window.ethereum)

  const results: TokenBalanceResult = {}

  for (const token of TOKENS as Token[]) {

    try {

      const contract = new window.ethers.Contract(
        token.address,
        ERC20_ABI,
        provider
      )

      const [rawBalance, decimals] = await Promise.all([
        contract.balanceOf(userAddress),
        contract.decimals()
      ])

      const formatted = Number(
        window.ethers.formatUnits(rawBalance, decimals)
      ).toFixed(2)

      results[token.name] = formatted

    } catch {
      results[token.name] = "0"
    }
  }

  return results
}

// =====================
// SEND PAYMENT (UNCHANGED)
// =====================

function sendPayment(): void {

  const activeToken =
    document.querySelector(".token.active")?.getAttribute("data-token") || "USDC"

  const amount = (document.getElementById("amountSend") as HTMLInputElement)?.value
  const address = (document.getElementById("addressSend") as HTMLInputElement)?.value
  const message = (document.getElementById("messageSend") as HTMLTextAreaElement)?.value

  showComfirmPage1(activeToken, amount, address, message)
}
// expose ra HTML
(window as any).sendPayment = sendPayment;

let paymentData = {
  amount: "",
  address: "",
  message: "",
  symbol: ""
};
function showComfirmPage1(
  symbol: string,
  amount: string,
  address: string,
  message: string
): void {

  document.getElementById("comfirmPage")?.classList.add("active-page")
  document.getElementById("scanqrPage")?.classList.remove("active-page")
  document.getElementById("sendPage")?.classList.remove("active-page")
  paymentData.symbol = symbol
  paymentData.amount = amount;
  paymentData.address = address;
  paymentData.message = message;
  const iconBox = document.getElementById("symbolIcon")

  if (!iconBox) return

  if (symbol === "USDC") {
    iconBox.innerHTML = `USDC `
  } else if (symbol === "EURC") {
    iconBox.innerHTML = `EURC`
  } else {
    iconBox.innerHTML = ""
  }

  const amountEl = document.getElementById("amountComfirm")
  const toEl = document.getElementById("toComfirm")
  const msgEl = document.getElementById("messageComfirm")


  if (amountEl) amountEl.innerText = amount
  if (toEl) toEl.innerText = address
  if (msgEl) msgEl.innerText = message
}
async function pay() {
  const payBtn = document.getElementById("payBtn") as HTMLButtonElement;
  const payBtnQR = document.getElementById("payBtnQR") as HTMLButtonElement;
  if (!window.ethereum) {
    Swal.fire({ title: "No wallet provider", icon: "error" });
    return;
  }

  const wallet = localStorage.getItem("wallet")?.toLowerCase();
  if (!wallet || !paymentData) return;

  try {
    // ======================
    // UI LOADING
    // ======================
    payBtn.disabled = true;
    payBtnQR.disabled = true;
    payBtn.innerHTML = `<span class="loader"></span> Validating...`;
    payBtnQR.innerHTML = `<span class="loader"></span> Validating...`;

    // ======================
    // 1. CALL BACKEND VALIDATE
    // ======================
    const validateRes = await fetch("http://localhost:3001/sendtx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: wallet,
        to: paymentData.address,
        amount: paymentData.amount,
        symbol: paymentData.symbol,
        message: paymentData.message
      })
    });

    const validateData = await validateRes.json();

    if (!validateRes.ok || !validateData.success) {
      throw new Error(validateData.error || "Validation failed");
    }

    // ======================
    // 2. SEND TX (SAU KHI VALIDATE OK)
    // ======================
    payBtn.innerHTML = `<span class="loader"></span> Processing...`;
    payBtnQR.innerHTML = `<span class="loader"></span> Processing...`;

    const adapter = await createViemAdapterFromProvider({
      provider: window.ethereum,
    });

    const result = await kit.send({
      from: { adapter, chain: "Arc_Testnet" },
      to: paymentData.address,
      amount: paymentData.amount,
      token: paymentData.symbol,
    });

    if (!result || result.state !== "success") {
      throw new Error("Transaction failed");
    }

    const hash1 = (result as any).txHash;

    // ======================
    // 3. SAVE FIRESTORE
    // ======================

    // ======================
    // 4. SUCCESS UI
    // ======================
    const address = localStorage.getItem("address");

if (address) {
  getBalance(address);
}


    document.getElementById("successPage")?.classList.add("active-page")
   document.getElementById("comfirmPage")?.classList.remove("active-page")
  document.getElementById("scanqrPage")?.classList.remove("active-page")
  document.getElementById("sendPage")?.classList.remove("active-page")
  const txHashEl = document.getElementById("txHashSuccess")
  const amountEl = document.getElementById("amountSuccess")
  const toEl = document.getElementById("toSuccess")
  const msgEl = document.getElementById("messageSuccess")
  payBtn.disabled = false;
  payBtnQR.disabled = false;
    payBtn.innerHTML = `
    Payment
    `;
     payBtnQR.innerHTML = `
    Payment
    `;
  if(paymentData.symbol === "USDC"){
   if (amountEl) amountEl.innerText = paymentData.amount + " USDC"
  }else{
    if (amountEl) amountEl.innerText = paymentData.amount + " EURC"
  }
  
  if (toEl) toEl.innerText = paymentData.address
  if (msgEl) msgEl.innerText = paymentData.message
  const hash = (result as any).txHash;

if (txHashEl && hash) {

  txHashEl.innerHTML = `
    <a
      href="${result.explorerUrl}"
      target="_blank"
      style="
        color:#8B5CF6;
        text-decoration:none;
        font-weight:600;
      "
    >
      ${hash} <i class="fa-solid fa-arrow-up-right-from-square"></i>
    </a>
  `;
}

//add to database

 await addDoc(
  collection(db, "transactions"),
  {
    txHash: hash,

    from: localStorage.getItem("wallet")?.toLowerCase(),
    to: paymentData.address?.toLowerCase(),

    participants: [
      localStorage.getItem("wallet")?.toLowerCase(),
      paymentData.address?.toLowerCase()
    ],

    amount: paymentData.amount,
    symbol: paymentData.symbol, // đổi token -> symbol cho đồng bộ UI

    message: paymentData.message || "",

    explorerUrl: result.explorerUrl,

    createdAt: Date.now()
  }
);

  

  } catch (err: any) {
    console.error(err);

    Swal.fire({
      title: err.message || "Payment failed",
      icon: "error"
    });

  } finally {
    // ======================
    // RESET BUTTON
    // ======================
    payBtn.disabled = false;
    payBtn.innerHTML = "Payment";
    payBtnQR.disabled = false;
    payBtnQR.innerHTML = "Payment";
  }
}
// expose ra HTML
(window as any).pay = pay;


// ===================== CONFIRM PAGE =====================
function showComfirmPage(symbol: string, amount: string, address: string, message: string): void {
  document.getElementById("comfirmPage")?.classList.add("active-page");
  document.getElementById("scanqrPage")?.classList.remove("active-page");
  paymentData.symbol = symbol
  paymentData.amount = amount;
  paymentData.address = address;
  paymentData.message = message;
  const iconBox = document.getElementById("symbolIcon") as HTMLDivElement;

  if (symbol === "USDC") {
    iconBox.innerHTML = `USDC`;
  } else if (symbol === "EURC") {
    iconBox.innerHTML = `EURC`;
  }

  (document.getElementById("amountComfirm") as HTMLElement).innerText = amount;
  (document.getElementById("toComfirm") as HTMLElement).innerText = address;
  (document.getElementById("messageComfirm") as HTMLElement).innerText = message;
}

//config firebase

const firebaseConfig = {

  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,

  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,

  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,

  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,

  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,

  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
 
const app = initializeApp(firebaseConfig);

const db = getFirestore(app, "hanzzz");
 console.log("PROJECT:", firebaseConfig.projectId);
const wallet = localStorage.getItem("wallet");

const q = query(

  collection(db, "transactions"),

  where("from", "==", wallet)

);

async function loadAllTransactions() {
  const wallet = localStorage.getItem("wallet")?.toLowerCase();
  if (!wallet) return;

  const container = document.querySelector("#tranhistoryPage .transactions") as HTMLElement;
  if (!container) return;

  let currentPage = 1;
  const pageSize = 7;
  let allTxs: any[] = [];

  try {
    const cache = localStorage.getItem("tx_cache");
    if (cache) {
      allTxs = JSON.parse(cache);
      render();
    }

    const q = query(
      collection(db, "transactions"),
      where("participants", "array-contains", wallet),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    allTxs = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    localStorage.setItem("tx_cache", JSON.stringify(allTxs));

    render();

    // =========================
    // RENDER FUNCTION
    // =========================
  function render() {
  container.innerHTML = `<h2>Transactions History</h2>`;

  if (allTxs.length === 0) {
    const empty = document.createElement("div");
    empty.style.textAlign = "center";
    empty.style.padding = "30px";
    empty.style.color = "#888";
    empty.innerText = "No records found";

    container.appendChild(empty);

    // ẩn pagination nếu có
    document.getElementById("pagination")?.remove();

    return;
  }

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  const pageItems = allTxs.slice(start, end);

  const frag = document.createDocumentFragment();

  for (const tx of pageItems) {
    const isReceive = tx.to === wallet;

    const el = document.createElement("div");
    el.className = "tx";

    el.innerHTML = `
      <div class="tx-info">
        <h3>${isReceive ? "Received" : "Sent"}</h3>
        <p>${tx.message || "No message"}</p>
      </div>

      <div class="amount ${isReceive ? "plus" : "minus"}">
        ${isReceive ? "+ " : "- "}${tx.amount} ${tx.symbol}
      </div>
    `;
         el.addEventListener("click", () => {
  localStorage.setItem("selected_tx", JSON.stringify(tx));

  document.getElementById("infotranPage")?.classList.add("active-page");
  document.getElementById("tranhistoryPage")?.classList.remove("active-page");

  const amountInfo = document.getElementById("amountInfo");
  const fromInfo = document.getElementById("fromInfo");
  const toInfo = document.getElementById("toInfo");
  const txHashInfo = document.getElementById("txHashInfo");
  const messageInfo = document.getElementById("messageInfo");
  const typeInfo = document.getElementById("typeInfo");
  const timeInfo = document.getElementById("timeInfo");

  // AMOUNT
  if (amountInfo) {
    amountInfo.innerText =
      tx.symbol === "USDC"
        ? `${tx.amount} USDC`
        : `${tx.amount} EURC`;
  }

  // TO / FROM
  if (toInfo) toInfo.innerText = tx.to;
  if (fromInfo) fromInfo.innerText = tx.from; 
  if (timeInfo) timeInfo.innerText = formatDateTime(tx.createdAt);
   const isReceive = tx.to === wallet;
   if (typeInfo) typeInfo.innerText = isReceive ? "Received" : "Sent"
  // MESSAGE
  if (messageInfo) messageInfo.innerText = tx.message || "";

  // HASH LINK
  if (txHashInfo && tx.txHash) {
    txHashInfo.innerHTML = `
      <a
        href="${tx.explorerUrl}"
        target="_blank"
        style="color:#8B5CF6;text-decoration:none;font-weight:600;"
      >
        ${tx.txHash}
        <i class="fa-solid fa-arrow-up-right-from-square"></i>
      </a>
    `;
  }

});

    frag.appendChild(el);
  }

  container.appendChild(frag);

  renderPagination();
}

    // =========================
    // PAGINATION UI
    // =========================
   function renderPagination() {
  document.getElementById("pagination")?.remove();

  const totalPages = Math.ceil(allTxs.length / pageSize);

  // không có data hoặc chỉ 1 page → ẩn luôn
  if (allTxs.length === 0 || totalPages < 1) return;

  const pag = document.createElement("div");
  pag.id = "pagination";
  pag.style.display = "flex";
  pag.style.gap = "10px";
  pag.style.justifyContent = "center";
  pag.style.marginTop = "15px";

  const prev = document.createElement("button");
  prev.classList.add("wallet-btn");
  prev.innerText = "Prev";
  prev.disabled = currentPage === 1;
  prev.onclick = () => {
    currentPage--;
    render();
  };

  const next = document.createElement("button");
  next.classList.add("wallet-btn");
  next.innerText = "Next";
  
  next.disabled = currentPage === totalPages;
  next.onclick = () => {
    currentPage++;
    render();
  };

  const info = document.createElement("span");
  info.classList.add("wallet-btn");
  info.innerText = `${currentPage} / ${totalPages}`;

  pag.appendChild(prev);
  pag.appendChild(info);
  pag.appendChild(next);

  container.appendChild(pag);
}

  } catch (err) {
    console.error(err);
  }
}
(window as any).loadAllTransactions = loadAllTransactions;
function formatDateTime(ts : number) {
  const d = new Date(ts);

  return d.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}
(window as any).formatDateTime = formatDateTime;
async function migrateTransactions() {
  const snap = await getDocs(collection(db, "transactions"));

  const batch = snap.docs.map(async (d) => {
    const data = d.data();

    const from = (data.from || "").toLowerCase();
    const to = (data.to || "").toLowerCase();

    // ⚡ thêm participants nếu chưa có
    if (!data.participants) {
      await updateDoc(doc(db, "transactions", d.id), {
        participants: [from, to]
      });
    }
  });

  await Promise.all(batch);

  console.log("Migration done");
}
(window as any).migrateTransactions = migrateTransactions;

async function loadRecentTransactions() {
  const wallet = localStorage.getItem("wallet")?.toLowerCase();
  if (!wallet) return;

  const container = document.querySelector("#tranrecentPage") as HTMLElement;
  if (!container) return;

  let allTxs: any[] = [];

  try {
    // ⚡ cache first
    const cache = localStorage.getItem("tx_cache");
    if (cache) {
      allTxs = JSON.parse(cache);
      render();
    }

    // 
    const q = query(
      collection(db, "transactions"),
      where("participants", "array-contains", wallet),
      orderBy("createdAt", "desc"),
      limit(5) // 
    );

    const snap = await getDocs(q);

    allTxs = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    localStorage.setItem("tx_cache", JSON.stringify(allTxs));

    render();

    // =========================
    // RENDER
    // =========================
    function render() {

      if (allTxs.length === 0) {
        const empty = document.createElement("div");
        empty.style.textAlign = "center";
        empty.style.padding = "30px";
        empty.style.color = "#888";
        empty.innerText = "No records found";

        container.appendChild(empty);
        return;
      }

      const frag = document.createDocumentFragment();

      for (const tx of allTxs) {
        const isReceive = tx.to === wallet;

        const el = document.createElement("div");
        el.className = "tx";

        el.innerHTML = `
          <div class="tx-info">
            <h3>${isReceive ? "Received" : "Sent"}</h3>
            <p>${tx.message || "No message"}</p>
          </div>

          <div class="amount ${isReceive ? "plus" : "minus"}">
            ${isReceive ? "+ " : "- "}${tx.amount} ${tx.symbol}
          </div>
        `;

        el.addEventListener("click", () => {
          localStorage.setItem("selected_tx", JSON.stringify(tx));

          document.getElementById("infotranPage")?.classList.add("active-page");
          document.getElementById("tranhistoryPage")?.classList.remove("active-page");

          const amountInfo = document.getElementById("amountInfo");
          const fromInfo = document.getElementById("fromInfo");
          const toInfo = document.getElementById("toInfo");
          const txHashInfo = document.getElementById("txHashInfo");
          const messageInfo = document.getElementById("messageInfo");
          const typeInfo = document.getElementById("typeInfo");
          const timeInfo = document.getElementById("timeInfo");

          if (amountInfo) {
            amountInfo.innerText =
              tx.symbol === "USDC"
                ? `${tx.amount} USDC`
                : `${tx.amount} EURC`;
          }

          if (toInfo) toInfo.innerText = tx.to;
          if (fromInfo) fromInfo.innerText = tx.from;

          if (timeInfo) timeInfo.innerText = formatDateTime(tx.createdAt);

          const isReceiveClick = tx.to === wallet;
          if (typeInfo) typeInfo.innerText = isReceiveClick ? "Received" : "Sent";

          if (messageInfo) messageInfo.innerText = tx.message || "";

          if (txHashInfo && tx.txHash) {
            txHashInfo.innerHTML = `
              <a href="${tx.explorerUrl}" target="_blank"
                 style="color:#8B5CF6;text-decoration:none;font-weight:600;">
                ${tx.txHash}
              </a>
            `;
          }
        });

        frag.appendChild(el);
      }

      container.appendChild(frag);
    }

  } catch (err) {
    console.error(err);
  }
}
(window as any).loadRecentTransactions = loadRecentTransactions;


// ================= SWAP TOKEN =================
const swapBtn = document.getElementById("swapSwitch")!;

const fromToken = document.getElementById("fromToken")!;
const toToken = document.getElementById("toToken")!;

// ===== setup input =====

function setupSwapInputs() {

  const fromAmount = document.getElementById("fromAmount") as HTMLInputElement;
  const toAmount = document.getElementById("toAmount") as HTMLInputElement;

  const rate = 1;

  let updating = false;

  // FROM -> TO
  fromAmount.oninput = () => {

    if (updating) return;

    updating = true;

    const value = parseFloat(fromAmount.value);

    if (isNaN(value)) {
      toAmount.value = "";
      updating = false;
      return;
    }

    toAmount.value = (value * rate).toFixed(2);

    updating = false;

  };

  // TO -> FROM
  toAmount.oninput = () => {

    if (updating) return;

    updating = true;

    const value = parseFloat(toAmount.value);

    if (isNaN(value)) {
      fromAmount.value = "";
      updating = false;
      return;
    }

    fromAmount.value = (value / rate).toFixed(2);

    updating = false;

  };

}


// ===== chạy lần đầu =====

setupSwapInputs();


// ===== SWAP BUTTON =====

swapBtn.addEventListener("click", () => {
   
     
  // animation
  swapBtn.classList.add("rotating");

  // swap html
  const temp = fromToken.innerHTML;

  fromToken.innerHTML = toToken.innerHTML;
  toToken.innerHTML = temp;
   const from = fromToken.dataset.token!;
  const to = toToken.dataset.token!;

  // hoán đổi data-token
  fromToken.dataset.token = to;
  toToken.dataset.token = from;

  // setup lại event sau khi swap DOM
  setupSwapInputs();

  // remove animation
  setTimeout(() => {
    swapBtn.classList.remove("rotating");
  }, 400);

});
const viemAdapter = createWalletClient({
  transport: custom(window.ethereum!)
});
async function swapToken() {
   Swal.fire({
      title: "Swap is undergoing maintenance.",
      icon: "warning"
    });
    return;

  const amount = document.getElementById("fromAmount")?.ariaValueText as string;
  const adapter = await createViemAdapterFromProvider({
      provider: window.ethereum,
    });
  const result = await kit.swap({
    
    from: {
      adapter: adapter,
      chain: "Arc_Testnet",
    },

    tokenIn: fromToken.dataset.token as string,
    tokenOut: toToken.dataset.token as string,

    amountIn: amount,

    config: {
      kitKey: import.meta.env.VITE_KIT_KEY as string,
    },

  });

  console.log(result);

}
(window as any).swapToken = swapToken;

const mobileMenuBtn = document.getElementById(
  "mobileMenuBtn"
) as HTMLButtonElement;

const sidebar = document.querySelector(
  ".sidebar"
) as HTMLElement;

mobileMenuBtn.addEventListener("click", () => {

  sidebar.classList.toggle("active");

});
