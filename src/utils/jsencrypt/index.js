// import JSEncrypt from 'jsencrypt-plus'
// 如果下面那行无效的话用这个
// import JSEncrypt from './jsencrypt.js'
// import * as JSEncrypt from './jsencrypt.js'

// 上面那行无效的话
// import * as JSEncrypt from 'jsencrypt-plus'

const publicKey = 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAKoR8mX0rGKLqzcWmOzbfj64K8ZIgOdH\n'
  + 'nzkXSOVOZbFu/TJhZ7rFAN+eaGkl3C4buccQd/EjEsj9ir7ijT7h96MCAwEAAQ=='

const privateKey = 'MIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEAqhHyZfSsYourNxaY\n'
  + '7Nt+PrgrxkiA50efORdI5U5lsW79MmFnusUA355oaSXcLhu5xxB38SMSyP2KvuKN\n'
  + 'PuH3owIDAQABAkAfoiLyL+Z4lf4Myxk6xUDgLaWGximj20CUf+5BKKnlrK+Ed8gA\n'
  + 'kM0HqoTt2UZwA5E2MzS4EI2gjfQhz5X28uqxAiEA3wNFxfrCZlSZHb0gn2zDpWow\n'
  + 'cSxQAgiCstxGUoOqlW8CIQDDOerGKH5OmCJ4Z21v+F25WaHYPxCFMvwxpcw99Ecv\n'
  + 'DQIgIdhDTIqD2jfYjPTY8Jj3EDGPbH2HHuffvflECt3Ek60CIQCFRlCkHpi7hthh\n'
  + 'YhovyloRYsM+IS9h/0BzlEAuO0ktMQIgSPT3aFAgJYwKpqRYKlLDVcflZFCKY7u3\n'
  + 'UP8iWi1Qw0Y='

/**
 * 加密
 */
export function encrypt(txt) {
  const encryptor = new JSEncrypt()
  encryptor.setPublicKey(publicKey) // 设置公钥
  return encryptor.encryptLong(txt) // 对数据进行加密
}

/**
 * 解密
 */
export function decrypt(txt) {
  const encryptor = new JSEncrypt()
  encryptor.setPrivateKey(privateKey) // 设置私钥
  const decryptedData = encryptor.decryptLong(txt)

  console.log(txt, encryptor.decryptLong(txt), '解密函数')

  return decryptedData // 对数据进行解密
}

/**
 * 测试解密
 */
export function sss(encryptedData) {
  const decryptContext = new JSEncrypt()
  decryptContext.setPrivateKey(privateKey)
  console.log(encryptedData, '需要解密的数据')

  const decryptedData = decryptContext.decryptLong(encryptedData)
  console.log('解密后的结果：', decryptedData)
  return decryptedData || '解析失败'
}

/**
 * 测试加密
 */
export function ssss(decryptedData) {
  const encryptContext = new JSEncrypt()
  encryptContext.setPublicKey(publicKey)
  console.log(decryptedData, '需要加密的数据')
  const encryptedData = encryptContext.encryptLong(decryptedData)
  console.log('加密后的结果：', encryptedData)
  return encryptedData
}
