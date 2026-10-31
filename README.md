# Timezone +13:00 standalone candidate

This is a release candidate, not an accepted release. Do not publish until the checklist passes.

Local preview (Node.js 22+):

```powershell
cd D:\00-Projects\00-reverse-engineering\11-eufrosyne-timezone13\release
$env:PORT='2038'
node serve.mjs
```

Open http://127.0.0.1:2038/ . The alternate player entry is /player/index.html . Opening files directly is unsupported.

Release checklist:
- [x] Single fixed release directory; static resources, no captures or oracle directories.
- [x] Runtime tests: 9/9 (framework scope).
- [x] Credits history mismatch fixed: fixed-counter simulation matches uninterrupted 30 Hz presentation and seeks at 228, 229, 233, 240 and 245 s.
- [x] Audio and credits sparse checkpoints: complete restore/forward state, PCM and frame checks pass. Sampled browser seeks0.13–1.35s; ending5.14→1.35s.
- [ ] Remaining scene accumulated-state equivalence and full-run performance/review.
- [x] Browser harness: canvas cases, pause, seek/backward seek, resume, original-code nonzero audio and natural ending pass.
- [ ] Full-run audio fidelity, transitions and performance acceptance. Replay/seek measured 5.10 s maximum worker advance; one presentation gap was 148 ms.
- [ ] Review both entry pages, controls, responsive layout and fullscreen against Bjoer (04-bjoer/05-bjoer).
- [ ] Human review of complete packaged audiovisual playback.

Deploy only after acceptance:
1. Upload the contents of this directory to one static-host directory, preserving all relative paths and filename case.
2. Serve .mjs as text/javascript, .json as application/json, binary resources as application/octet-stream.
3. Use HTTPS. Set Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.
4. Open the deployed index.html, start playback, exercise pause, seek, mute, fullscreen and natural ending. Check failed requests and browser errors.
5. Publish only after your review. No publication has been performed.


Effects explained: open `effects-explained/voxel-tunnel.html` for the live S3 voxel construction and polar tunnel lesson. Original data; no captured frames.
