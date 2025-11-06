# ChainScope - x402 Hackathon Demo Video Script

**Total Time: 3 minutes**
**Target: Solana x402 Hackathon - Track 2 (Best x402 API Integration)**

---

## 🎬 INTRO (30 seconds)

### What to Say:
```
"Hi, I'm presenting ChainScope - a production-ready API that brings
micropayments to Solana wallet analytics using the x402 protocol.

Traditional APIs use API keys - they're centralized, require registration,
and create vendor lock-in.

x402 changes this. Instead of API keys, you pay per request with USDC.
No registration, no subscriptions - just permissionless, pay-as-you-go access.

Let me show you how it works."
```

### What to Show:
- **Screen 1:** ChainScope homepage at https://chain-scope.dev
- **Screen 2:** Briefly show a traditional API dashboard (any example) with API keys
- **Screen 3:** Back to ChainScope - emphasize "Pay per request"

### Notes:
- Speak slowly and clearly
- Smile (even though they can't see you, it helps your tone)
- Take a breath between sections

---

## 🔴 LIVE DEMO: The Payment Flow (2 minutes)

### PART 1: Initial Request & 402 Challenge (30 seconds)

#### What to Say:
```
"First, I'll request wallet analytics WITHOUT payment.
Watch what happens..."
```

#### What to Do:
1. **Open Browser DevTools** (F12)
2. **Go to Network tab**
3. **Enter example wallet address:** `DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK`
4. **Select "Portfolio Analysis" (costs 0.05 USDC)**
5. **Click "Fetch Analytics"** (without wallet connected)

#### What to Show:
- **Network tab:** Highlight the HTTP request
- **Point to Status Code:** `402 Payment Required`
- **Click on the request** to show Response body
- **Highlight the payment challenge JSON:**
  ```json
  {
    "x402Version": 1,
    "amount": "0.05",
    "currency": "USDC",
    "recipient": "...",
    "memo": "pay_123..."
  }
  ```

#### What to Say:
```
"The server responds with HTTP 402 - Payment Required.
This includes everything needed to make a payment:
- The amount: 0.05 USDC
- The merchant wallet to pay
- A unique memo to prevent replays"
```

---

### PART 2: Making the Payment (45 seconds)

#### What to Say:
```
"Now I'll connect my Phantom wallet and make the payment."
```

#### What to Do:
1. **Click "Connect Wallet"**
2. **Approve Phantom connection** (should be instant if pre-connected)
3. **Click "Fetch Analytics" again**
4. **Phantom popup appears** - show it clearly
5. **Approve the transaction** (0.05 USDC)

#### What to Show:
- **Phantom popup** with transaction details
- **Point out:**
  - Amount: 0.05 USDC
  - To: Your merchant wallet
  - Memo: The payment ID

#### What to Say:
```
"Phantom prompts me to approve the USDC payment.
Notice the memo - this uniquely identifies this request
and prevents the same transaction from being reused.

I approve..."
```

---

### PART 3: Verification & Data Delivery (30 seconds)

#### What to Say:
```
"Here's where the magic happens - the x402 protocol in action."
```

#### What to Do:
1. **Wait for transaction to confirm** (~2-3 seconds)
2. **Network tab:** Show the RETRY request
3. **Highlight the X-PAYMENT header** (in Request Headers)
4. **Show Response:** Status 200 OK
5. **Show the wallet analytics data** on screen

#### What to Show:
- **Network tab:**
  - Second request to same endpoint
  - Request Headers: `X-PAYMENT: base64_encoded_proof`
  - Response: 200 OK with JSON data
- **Frontend:** Beautiful analytics display

#### What to Say:
```
"The frontend automatically retries with an X-PAYMENT header.
This contains proof of the transaction.

The server verifies the transaction directly on Solana's blockchain:
- Checks the signature exists
- Validates the amount matches
- Confirms the memo is correct
- Ensures it's recent and not reused

Verification passes - and here's my data!"
```

---

### PART 4: Quick Code Tour (15 seconds)

#### What to Say:
```
"Let me quickly show you the implementation."
```

#### What to Do:
1. **Switch to code editor**
2. **Open:** `src/middleware/x402Payment.ts`
3. **Scroll to the key section** (around line 106-154)
4. **Highlight:** The on-chain verification call

#### What to Show:
```typescript
// On-chain verification mode
if (config.payment.mode === 'onchain') {
  logger.info({ url, price }, 'Verifying payment on-chain');

  const verificationResult = await verifyOnChainPayment(payment, requirement);

  if (!verificationResult.isValid) {
    // Reject invalid payment
  }

  // Payment verified! Grant access...
}
```

#### What to Say:
```
"This is the x402 middleware. When a payment header arrives,
we verify it directly against Solana's blockchain.

No third-party payment processors. No middlemen.
Just pure on-chain verification."
```

---

## 🎯 CLOSING (30 seconds)

### What to Say:
```
"So that's ChainScope - a complete x402 implementation.

Key highlights:
✓ Full HTTP 402 Payment Required protocol
✓ Direct on-chain verification - fully decentralized
✓ Actually deployed in production at chain-scope.dev
✓ Real USDC payments on Solana mainnet
✓ Comprehensive tests and documentation

This demonstrates x402's potential: permissionless, micropayment-powered APIs
with no gatekeepers.

All the code is open source on GitHub.
Thanks for watching!"
```

### What to Show:
- **Screen 1:** ChainScope website (chain-scope.dev)
- **Screen 2:** GitHub repos side by side:
  - https://github.com/halfkey/wallet-analytics-api-x402
  - https://github.com/halfkey/wallet-analytics-demo
- **Screen 3 (final):**
  ```
  ChainScope
  Solana x402 Hackathon

  Live: chain-scope.dev
  GitHub: @halfkey
  ```

---

## 🎬 PRODUCTION TIPS

### Before Recording:

**1. Prepare Your Environment:**
- [ ] Close all unnecessary apps and browser tabs
- [ ] Set browser to full screen (F11)
- [ ] Increase browser zoom to 110-125% (easier to read)
- [ ] Use DevTools in "separate window" mode (easier to see)
- [ ] Have wallet pre-connected with ~$1 USDC
- [ ] Test the full flow once beforehand

**2. Recording Setup:**
- [ ] Use 1080p resolution (1920x1080)
- [ ] Frame rate: 30fps minimum
- [ ] Clear your browser history so URLs autocomplete correctly
- [ ] Have the example wallet address copied: `DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK`

**3. Audio Setup:**
- [ ] Test microphone levels (speak at normal volume)
- [ ] Reduce background noise (close windows, silence phone)
- [ ] Use headphones to monitor audio if possible

---

### During Recording:

**Pacing:**
- Speak slightly slower than normal conversation
- Pause 1-2 seconds between major points
- Don't rush through the demo - judges need time to see what's happening

**Cursor Movement:**
- Move cursor deliberately to highlight what you're discussing
- Circle important text with cursor
- Hover over key UI elements as you mention them

**Mistakes:**
- If you mess up, just pause 3 seconds and restart the sentence
- You can edit out mistakes later
- Don't say "um" or "uh" - just pause silently instead

**Energy:**
- Enthusiasm is good! Show you're excited about what you built
- Vary your tone - don't be monotone
- Smile while speaking - it comes through in your voice

---

### After Recording:

**Editing Checklist:**
- [ ] Cut out any long pauses or mistakes
- [ ] Speed up slow parts (like wallet confirmation waits) to 1.5-2x
- [ ] Add text overlays for key points:
  - "HTTP 402 Payment Required" when showing status
  - "On-chain Verification" during that section
  - "Direct Blockchain Verification - No Third Parties"
- [ ] Verify total runtime is under 3:00 minutes
- [ ] Export as MP4 (H.264 codec, 1080p)

**Optional Enhancements:**
- Add background music (very quiet, non-distracting)
- Add your GitHub username as a watermark
- Include URL at the end: "chain-scope.dev"

---

## 📝 BACKUP: If Things Go Wrong

### If Wallet Connection Fails:
"I'll use a pre-recorded example here... [switch to backup recording]"

### If Network is Slow:
"While this transaction confirms, let me show you the code..." [switch to code view]

### If You Forget Something:
Don't worry! Just naturally say: "Let me also show you..." and add it

---

## 🎯 PRACTICE RUNS

Before final recording, do 3 practice runs:

**Run 1:** Full script, don't worry about time
**Run 2:** Same, but aim for 3 minutes
**Run 3:** Final run - record this as backup

---

## ✅ FINAL CHECKLIST

Before you hit record:

- [ ] Script printed or on second monitor
- [ ] Browser ready at chain-scope.dev
- [ ] DevTools open in separate window
- [ ] Wallet connected with USDC
- [ ] Example wallet address copied
- [ ] Code editor open to x402Payment.ts
- [ ] Recording software tested
- [ ] Microphone tested
- [ ] Timer visible (to track 3-minute limit)
- [ ] Phone on silent
- [ ] "Do Not Disturb" mode enabled

---

## 🚀 YOU'VE GOT THIS!

Remember:
- The judges want to see x402 working - you've built that!
- Your project is actually deployed and functional - huge advantage
- You understand the code - just explain it clearly
- 3 minutes is plenty of time - don't rush
- Confidence comes from preparation - and you're prepared!

Good luck! 🎉
