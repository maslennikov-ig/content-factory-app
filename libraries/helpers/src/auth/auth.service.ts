import { sign, verify } from 'jsonwebtoken';
import { hashSync, compareSync } from 'bcrypt';
import crypto from 'crypto';
// @ts-ignore
import EVP_BytesToKey from 'evp_bytestokey';
const algorithm = 'aes-256-cbc';
const { keyLength, ivLength } = crypto.getCipherInfo(algorithm);
const BCRYPT_MAX_PASSWORD_BYTES = 72;
const SHA256_BCRYPT_PASSWORD_PREFIX = 'cf$bcrypt-sha256$v1$';

function sha256PasswordMaterial(password: string) {
  return crypto.createHash('sha256').update(password, 'utf8').digest('base64');
}

function deriveLegacyKeyIv(secret: string) {
  const { keyLength, ivLength } = crypto.getCipherInfo(algorithm); // 32, 16
  const pass = Buffer.isBuffer(secret) ? secret : Buffer.from(secret ?? '', 'utf8');

  // evp_bytestokey: key length in **bits**, IV length in **bytes**
  const { key, iv } = EVP_BytesToKey(pass, null, keyLength * 8, ivLength, 'md5');

  if (key.length !== keyLength || iv.length !== ivLength) {
    throw new Error(`Derived wrong sizes (key=${key.length}, iv=${iv.length})`);
  }
  return { key, iv };
}

export function decrypt_legacy_using_IV(hexCiphertext: string) {
  const { key, iv } = deriveLegacyKeyIv(process.env.JWT_SECRET);
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const out = Buffer.concat([decipher.update(hexCiphertext, 'hex'), decipher.final()]);
  return out.toString('utf8');
}

export function encrypt_legacy_using_IV(utf8Plaintext: string) {
  const { key, iv } = deriveLegacyKeyIv(process.env.JWT_SECRET);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const out = Buffer.concat([cipher.update(utf8Plaintext, 'utf8'), cipher.final()]);
  return out.toString('hex');
}
export class AuthService {
  static hashPassword(password: string) {
    if (Buffer.byteLength(password, 'utf8') < BCRYPT_MAX_PASSWORD_BYTES) {
      return hashSync(password, 10);
    }

    return (
      SHA256_BCRYPT_PASSWORD_PREFIX +
      hashSync(sha256PasswordMaterial(password), 10)
    );
  }
  static comparePassword(password: string, hash: string) {
    if (hash.startsWith(SHA256_BCRYPT_PASSWORD_PREFIX)) {
      return compareSync(
        sha256PasswordMaterial(password),
        hash.slice(SHA256_BCRYPT_PASSWORD_PREFIX.length)
      );
    }

    return compareSync(password, hash);
  }
  static signJWT(value: object) {
    return sign(value, process.env.JWT_SECRET!);
  }
  static verifyJWT(token: string) {
    return verify(token, process.env.JWT_SECRET!);
  }

  static signSessionJWT(user: object) {
    return this.signJWT({ ...user, purpose: 'session' });
  }

  static verifySessionJWT(token: string) {
    const value = this.verifyJWT(token);
    if (typeof value !== 'object' || typeof value.id !== 'string') {
      throw new Error('Invalid session token');
    }
    // Legacy sessions contained the full active user. Reset links contained
    // only id/expires; pending activation carried activated:false. Keep the
    // former, never promote either of the latter after a database change.
    const legacySession = value.purpose === undefined &&
      value.activated === true && typeof value.email === 'string' &&
      typeof value.providerName === 'string' && value.expires === undefined;
    if (value.purpose !== 'session' && !legacySession) {
      throw new Error('Invalid session purpose');
    }
    return value;
  }

  static passwordResetVersion(passwordHash: string) {
    return crypto.createHmac('sha256', process.env.JWT_SECRET!)
      .update('password-reset:v1:').update(passwordHash).digest('hex');
  }

  static signPasswordResetJWT(id: string, passwordHash: string) {
    return sign({ id, purpose: 'password_reset', passwordVersion: this.passwordResetVersion(passwordHash) },
      process.env.JWT_SECRET!, { expiresIn: '20m' });
  }

  static verifyPasswordResetJWT(token: string) {
    const value = this.verifyJWT(token);
    if (typeof value !== 'object' || value.purpose !== 'password_reset' ||
      typeof value.id !== 'string' || typeof value.exp !== 'number' ||
      typeof value.passwordVersion !== 'string') {
      throw new Error('Invalid password reset token');
    }
    return value;
  }

  static signActivationJWT(user: object) {
    return sign({ ...user, purpose: 'activation' }, process.env.JWT_SECRET!, { expiresIn: '1d' });
  }

  static verifyActivationJWT(token: string) {
    const value = this.verifyJWT(token);
    if (typeof value !== 'object' || typeof value.id !== 'string' ||
      typeof value.email !== 'string' || value.activated !== false ||
      (value.purpose !== 'activation' && !(value.purpose === undefined &&
        typeof value.providerName === 'string' && value.expires === undefined))) {
      throw new Error('Invalid activation token');
    }
    return value;
  }

  static fixedEncryption(value: string) {
    return encrypt_legacy_using_IV(value);
  }

  static fixedDecryption(hash: string) {
    return decrypt_legacy_using_IV(hash);
  }
}
