import test from "node:test";
import assert from "node:assert/strict";
import { decodeDtcFromBytes, decodeDtcList } from "../dtc.js";

test("decode single DTC bytes -> code", () => {
  // Example: P0301 (Cylinder 1 Misfire) -> bytes: 0x03 0x01 with 'P' system (hi bits 00)
  const code = decodeDtcFromBytes(0x03, 0x01);
  assert.equal(code, "P0301");
});

test("decode list ignores P0000", () => {
  const list = decodeDtcList(new Uint8Array([0x00, 0x00, 0x03, 0x01]));
  assert.deepEqual(list, ["P0301"]);
});
