import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto';
import { ApiError } from '../http/errors.js';
export interface CredentialEnvelope {version:1;iv:string;tag:string;ciphertext:string}
function key(value:string|null|undefined):Buffer {
 if(!value)throw new ApiError(503,'CREDENTIAL_STORAGE_UNCONFIGURED','Configure the server connector credential key before storing credentials.');
 const decoded=Buffer.from(value,'base64');
 if(decoded.length!==32||decoded.toString('base64')!==value)throw new ApiError(503,'CREDENTIAL_STORAGE_UNCONFIGURED','Connector credential storage is unavailable.');
 return decoded;
}
/** Server-only authenticated encryption. AAD prevents moving a secret to another tenant/connection. */
export function encryptConnectorCredential(secret:string,configuredKey:string|null|undefined,context:string):CredentialEnvelope {
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(configuredKey),nonce);
 cipher.setAAD(Buffer.from(context,'utf8'));
 const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
 return {version:1,iv:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')};
}
export function decryptConnectorCredential(envelope:CredentialEnvelope,configuredKey:string|null|undefined,context:string):string {
 try {
  if(envelope.version!==1)throw new Error('Unsupported envelope.');
  const nonce=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');
  if(nonce.length!==12||tag.length!==16)throw new Error('Invalid envelope.');
  const cipher=createDecipheriv('aes-256-gcm',key(configuredKey),nonce);cipher.setAAD(Buffer.from(context,'utf8'));cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext,'base64')),cipher.final()]).toString('utf8');
 }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,'CONNECTOR_CREDENTIAL_UNAVAILABLE','The connector credential could not be opened. Check server configuration.');}
}
