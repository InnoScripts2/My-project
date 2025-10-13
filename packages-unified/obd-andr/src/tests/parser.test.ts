import test from "node:test";
import assert from "node:assert/strict";
import { decodeMode01 } from "../parser.js";

test("decode RPM from '41 0C 1A F8' => 1726 rpm", () => {
  const res = decodeMode01("41 0C 1A F8");
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.pid, 0x0c);
    assert.equal(res.data.name, "Engine RPM");
    assert.equal(res.data.unit, "rpm");
    assert.equal(res.data.value, 1726);
  }
});

test("decode speed from '41 0D 2A' => 42 km/h", () => {
  const res = decodeMode01("41 0D 2A");
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.value, 42);
  }
});
