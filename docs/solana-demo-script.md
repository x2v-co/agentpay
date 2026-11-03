> Historical storyboard for the earlier formal film. The selected final video is
> ecosystem v5; see [selected-video review](solana-release-review.md).

# Solana demo — 3:04, original BGM, no TTS

Deliverable: `AgentPay-Solana-Verified-Demo-1080p.mp4` (local output).
English evidence cards with Chinese subtitles. The existing 64-second approved
animation opens the film, with a persistent historical-footage label. The rest
is an animated review of a completed, independently verified transaction, not
a recording of another live purchase. Do not present evidence cards as raw
wallet footage or use this video to claim a second payment.

| Time | Picture and intended message |
| --- | --- |
| 00:00–01:04 | Approved v3 animation and existing project identity. Overlay: historical Monad/simulation introduction; Solana proof begins at 01:04. |
| 01:04–01:24 | 402 → signature → settlement → confirmation → report. Fixed-price attended flow; no payment occurs during recording. |
| 01:24–01:44 | Exact devnet network, mint, payer, recipient and 0.001 test-USDC amount from the verified order. |
| 01:44–02:04 | Finalized slot/time and actual 20→19.999 / 20→20.001 balance changes; facilitator fee. |
| 02:04–02:24 | Actual order ID and memo, message-hash match; durable claim and pending recovery. |
| 02:24–02:44 | Real output calculation: 0.25×3=0.75; 5−1−0.75=3.25. HTTP 200, delivered. Sample inputs explicitly labeled. |
| 02:44–03:04 | Setup commands, 79 offline tests, reproducible evidence and developer-preview limitations. |

## Materials and provenance

- Approved `AgentPay-v3-BGM-1080p.mp4`: 64-second prior project animation. It
  contains historical Monad/interactive-simulation scenes; never relabel as
  this Solana payment.
- Original project soundtrack `Checkpoint / 120`: locally generated procedural
  score, no commercial song or TTS; reused under the original project permission.
- `docs/evidence/devnet-delivery-20261103.json`: authoritative data for all new
  cards. No browser profile, email, session bearer token, signature payload,
  private key or seed phrase is included.
- Renderer: `scripts/render-solana-demo.py`. Requires ffmpeg and Pillow; local
  macOS fonts are referenced, not distributed. Use `--assets` and `--output`.
- Any future raw screen recording should show only the app viewport and public
  Explorer result; exclude browser account/profile chrome and wallet secrets.
  Prefer review of this already-finalized order. A new paid run needs separate
  user action and must not be fabricated just to fill a video timeline.

## Review gates

Verify the final file is 184 seconds, 1920×1080, H.264/AAC, and decodes completely.
Inspect a contact sheet spanning intro, contract, finality, memo and report.
Check the music contains no speech and no peak clipping. Keep the video local
until publication is explicitly authorized. Exact contest form/video URL
requirements remain subject to the authenticated form check.
