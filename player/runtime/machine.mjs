/**
 * Guest x86 Machine State & Memory Abstraction for JavaScript Porting.
 *
 * Provides accurate 32-bit x86 memory layout, segmented addresses, little-endian reads/writes,
 * stack operations, arithmetic flag calculations (CF, PF, AF, ZF, SF, OF), and integer math.
 */

// Parity table for lower 8 bits (1 if even number of 1-bits, 0 if odd)
const parity = (value) => ((0x9669 >>> (((value & 255) ^ ((value & 255) >>> 4)) & 15)) & 1) !== 0;

// Arithmetic flags bitmask: CF(0), PF(2), AF(4), ZF(6), SF(7), OF(11)
const ARITH_MASK = 0x8d5;

export class DemoMachine {
  constructor(memory, registers = {}, { onWrite } = {}) {
    this.memory = memory;
    this.view = new DataView(memory.buffer, memory.byteOffset, memory.byteLength);
    this.r = {
      eax: 0, ebx: 0, ecx: 0, edx: 0,
      esi: 0, edi: 0, ebp: 0, esp: 0,
      eip: 0, eflags: 0x202,
      cs: 0, ds: 0, es: 0, ss: 0, fs: 0, gs: 0,
      ...registers
    };
    this.onWrite = onWrite;
  }

  check(address, size) {
    if (!Number.isInteger(address) || address < 0 || address + size > this.memory.length) {
      throw new RangeError(`Out of bounds memory access: 0x${address.toString(16)} (size ${size})`);
    }
  }

  // Memory Reads (little-endian)
  u8(addr) {
    this.check(addr, 1);
    return this.view.getUint8(addr);
  }

  u16(addr) {
    this.check(addr, 2);
    return this.view.getUint16(addr, true);
  }

  u32(addr) {
    this.check(addr, 4);
    return this.view.getUint32(addr, true);
  }

  i8(addr) {
    this.check(addr, 1);
    return this.view.getInt8(addr);
  }

  i16(addr) {
    this.check(addr, 2);
    return this.view.getInt16(addr, true);
  }

  i32(addr) {
    this.check(addr, 4);
    return this.view.getInt32(addr, true);
  }

  // Memory Writes (little-endian)
  w8(addr, value) {
    this.check(addr, 1);
    this.view.setUint8(addr, value & 0xff);
    this.onWrite?.(addr, 1, BigInt(value & 0xff));
  }

  w16(addr, value) {
    this.check(addr, 2);
    this.view.setUint16(addr, value & 0xffff, true);
    this.onWrite?.(addr, 2, BigInt(value & 0xffff));
  }

  w32(addr, value) {
    this.check(addr, 4);
    this.view.setUint32(addr, value >>> 0, true);
    this.onWrite?.(addr, 4, BigInt(value >>> 0));
  }

  // Stack operations
  push(value, size = 4) {
    this.r.esp = (this.r.esp - size) >>> 0;
    if (size === 2) {
      this.w16(this.r.esp, value);
    } else {
      this.w32(this.r.esp, value);
    }
  }

  pop(size = 4) {
    const value = size === 2 ? this.u16(this.r.esp) : this.u32(this.r.esp);
    this.r.esp = (this.r.esp + size) >>> 0;
    return value;
  }

  pushAll() {
    const saved = this.r.esp;
    const values = [this.r.eax, this.r.ecx, this.r.edx, this.r.ebx, saved, this.r.ebp, this.r.esi, this.r.edi];
    this.r.esp = (saved - 32) >>> 0;
    values.forEach((v, idx) => this.w32(this.r.esp + (7 - idx) * 4, v));
  }

  popAll() {
    this.r.edi = this.pop();
    this.r.esi = this.pop();
    this.r.ebp = this.pop();
    this.pop(); // throw away saved ESP
    this.r.ebx = this.pop();
    this.r.edx = this.pop();
    this.r.ecx = this.pop();
    this.r.eax = this.pop();
  }

  // Flags Calculation
  updateFlags(result, width, extra = 0, preserveCarry = false) {
    const mask = width === 32 ? 0xffffffff : (1 << width) - 1;
    const signBit = 1 << (width - 1);
    const value = (result & mask) >>> 0;
    const carry = preserveCarry ? (this.r.eflags & 1) : (extra & 1);
    
    this.r.eflags = ((this.r.eflags & ~ARITH_MASK) |
      carry |
      (extra & 0x810) | // OF (bit 11) and AF (bit 4)
      (value === 0 ? 0x40 : 0) | // ZF (bit 6)
      ((value & signBit) !== 0 ? 0x80 : 0) | // SF (bit 7)
      (parity(value) ? 0x04 : 0)) >>> 0; // PF (bit 2)
      
    return value;
  }

  // Arithmetic & Logic
  add(a, b, width = 32, preserveCarry = false) {
    const modulus = width === 32 ? 4294967296 : 1 << width;
    const mask = width === 32 ? 0xffffffff : modulus - 1;
    const signBit = 1 << (width - 1);
    a = (a & mask) >>> 0;
    b = (b & mask) >>> 0;
    const sum = a + b;
    const value = (sum & mask) >>> 0;
    const carry = sum >= modulus ? 1 : 0;
    const aux = (a ^ b ^ value) & 0x10;
    const overflow = (~(a ^ b) & (a ^ value) & signBit) ? 0x800 : 0;
    return this.updateFlags(value, width, carry | aux | overflow, preserveCarry);
  }

  sub(a, b, width = 32, preserveCarry = false) {
    const modulus = width === 32 ? 4294967296 : 1 << width;
    const mask = width === 32 ? 0xffffffff : modulus - 1;
    const signBit = 1 << (width - 1);
    a = (a & mask) >>> 0;
    b = (b & mask) >>> 0;
    const diff = a - b;
    const value = (diff & mask) >>> 0;
    const carry = a < b ? 1 : 0;
    const aux = (a ^ b ^ value) & 0x10;
    const overflow = ((a ^ b) & (a ^ value) & signBit) ? 0x800 : 0;
    return this.updateFlags(value, width, carry | aux | overflow, preserveCarry);
  }

  logic(value, width = 32) {
    // AND, OR, XOR clear CF and OF, AF is undefined (cleared)
    return this.updateFlags(value, width, 0);
  }

  imul(a, b) {
    const val = Math.imul(a, b) >>> 0;
    const overflow = (a | 0) * (b | 0) !== (val | 0);
    this.r.eflags = ((this.r.eflags & ~0x801) | (overflow ? 0x801 : 0)) >>> 0;
    return val;
  }

  shift(value, count, width, kind) {
    count &= 31;
    if (!count) return value;
    const mask = width === 32 ? 0xffffffff : (1 << width) - 1;
    value = (value & mask) >>> 0;
    let result = 0, carry = 0, overflow = 0;
    
    if (kind === 'shl') {
      result = (value << count) & mask;
      carry = count <= width ? (value >>> (width - count)) & 1 : 0;
      overflow = ((result >>> (width - 1)) ^ carry) & 1;
    } else if (kind === 'shr') {
      result = value >>> count;
      carry = (value >>> (count - 1)) & 1;
      overflow = (value >>> (width - 1)) & 1;
    } else { // 'sar'
      const signed = width === 32 ? (value | 0) : (value << (32 - width) >> (32 - width));
      result = (signed >> count) & mask;
      carry = (signed >> (count - 1)) & 1;
    }
    
    return this.updateFlags(result, width, carry | (count === 1 && overflow ? 0x800 : 0));
  }
}
