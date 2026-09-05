/**
 * Hardware-accelerated client-side cryptography helper using Web Crypto API
 */

export const deriveSessionKey = async (email, password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase() + ":" + password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
};

export const encryptPrivateKey = async (privateKey, passphrase) => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase.padEnd(32, "0").slice(0, 32)),
    { name: "AES-CBC" },
    false,
    ["encrypt", "decrypt"]
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    keyMaterial,
    encoder.encode(privateKey)
  );

  const rawEncrypted = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + rawEncrypted.length);
  combined.set(iv);
  combined.set(rawEncrypted, iv.length);
  
  return btoa(String.fromCharCode.apply(null, combined));
};

export const decryptPrivateKey = async (ciphertext, passphrase) => {
  const encoder = new TextEncoder();
  const binaryString = atob(ciphertext);
  const combined = new Uint8Array(binaryString.length).map((_, i) => binaryString.charCodeAt(i));
  
  const iv = combined.slice(0, 16);
  const rawEncrypted = combined.slice(16);
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase.padEnd(32, "0").slice(0, 32)),
    { name: "AES-CBC" },
    false,
    ["encrypt", "decrypt"]
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    keyMaterial,
    rawEncrypted
  );
  
  return new TextDecoder().decode(decrypted);
};
