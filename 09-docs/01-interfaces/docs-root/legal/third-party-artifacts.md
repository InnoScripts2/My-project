# Third-party software policy

We strictly forbid reverse engineering, decompilation, extraction of resources, or any similar actions on third-party APKs unless explicitly and contractually licensed with source access.

- APKs may be stored locally under `artifacts/third-party/` for reference only and must not be published.
- Integration paths:
  - OBD-II: based on public standards (ELM327, SAE J1979) or official SDKs.
  - Thickness gauge: via vendor-provided SDK or documented BLE GATT (when available).
- If a protocol/spec is not public, we contact the vendor for proper access. No reverse engineering.

Licensed sources:

- The project owners may receive legally licensed source materials from partners (e.g., rDevice, Diagzone PRO) under a revenue-share agreement (3–5%). Such materials can be used strictly within the terms of the contract and without redistribution.
- Credits for licensed partners must be displayed on the post-service “Спасибо/Готово” screens. See: `docs/legal/third-party-credits.json`.

See also: `.github/instructions/instructions.instructions.md` sections 2 and 10.
