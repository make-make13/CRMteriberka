type TypedArrayHex = Uint8Array & {
  toHex?: () => string;
};

type ComputedMap<K, V> = Map<K, V> & {
  getOrInsert?: (key: K, value: V) => V;
  getOrInsertComputed?: (key: K, callback: (key: K) => V) => V;
};

type ComputedWeakMap<K extends object, V> = WeakMap<K, V> & {
  getOrInsert?: (key: K, value: V) => V;
  getOrInsertComputed?: (key: K, callback: (key: K) => V) => V;
};

const PDFJS_COMPAT_MARKER = '__bmPdfjsRuntimeCompatibilityInstalled';

function installUint8ArrayToHex() {
  const prototype = Uint8Array.prototype as TypedArrayHex;
  if (typeof prototype.toHex === 'function') return;

  const byteToHex = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, '0'));
  Object.defineProperty(prototype, 'toHex', {
    value(this: Uint8Array) {
      let result = '';
      for (let index = 0; index < this.length; index += 1) {
        result += byteToHex[this[index]];
      }
      return result;
    },
    configurable: true,
    writable: true,
  });
}

function installMapGetOrInsert() {
  const prototype = Map.prototype as ComputedMap<unknown, unknown>;

  if (typeof prototype.getOrInsert !== 'function') {
    Object.defineProperty(prototype, 'getOrInsert', {
      value(this: Map<unknown, unknown>, key: unknown, value: unknown) {
        if (this.has(key)) return this.get(key);
        this.set(key, value);
        return value;
      },
      configurable: true,
      writable: true,
    });
  }

  if (typeof prototype.getOrInsertComputed !== 'function') {
    Object.defineProperty(prototype, 'getOrInsertComputed', {
      value(this: Map<unknown, unknown>, key: unknown, callback: (key: unknown) => unknown) {
        if (this.has(key)) return this.get(key);
        const value = callback(key);
        this.set(key, value);
        return value;
      },
      configurable: true,
      writable: true,
    });
  }
}

function installWeakMapGetOrInsert() {
  const prototype = WeakMap.prototype as ComputedWeakMap<object, unknown>;

  if (typeof prototype.getOrInsert !== 'function') {
    Object.defineProperty(prototype, 'getOrInsert', {
      value(this: WeakMap<object, unknown>, key: object, value: unknown) {
        if (this.has(key)) return this.get(key);
        this.set(key, value);
        return value;
      },
      configurable: true,
      writable: true,
    });
  }

  if (typeof prototype.getOrInsertComputed !== 'function') {
    Object.defineProperty(prototype, 'getOrInsertComputed', {
      value(this: WeakMap<object, unknown>, key: object, callback: (key: object) => unknown) {
        if (this.has(key)) return this.get(key);
        const value = callback(key);
        this.set(key, value);
        return value;
      },
      configurable: true,
      writable: true,
    });
  }
}

export function installPdfjsRuntimeCompatibility() {
  const globalScope = globalThis as typeof globalThis & Record<string, unknown>;
  if (globalScope[PDFJS_COMPAT_MARKER]) return;

  installUint8ArrayToHex();
  installMapGetOrInsert();
  installWeakMapGetOrInsert();

  globalScope[PDFJS_COMPAT_MARKER] = true;
}

installPdfjsRuntimeCompatibility();
